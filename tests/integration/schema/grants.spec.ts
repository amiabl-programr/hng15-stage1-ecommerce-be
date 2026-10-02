import { randomUUID } from 'node:crypto';

import type { DatabaseError, PoolClient } from 'pg';

import { describeWithStack, pool } from '../support/stack.ts';

interface SqlFailure {
  code: string | undefined;
  message: string;
}

async function withRolledBackClient<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('rollback');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function captureSqlError(
  client: PoolClient,
  fn: () => Promise<unknown>,
): Promise<SqlFailure> {
  const savepoint = `probe_${randomUUID().replaceAll('-', '')}`;
  await client.query(`savepoint ${savepoint}`);
  try {
    await fn();
  } catch (error) {
    await client.query(`rollback to savepoint ${savepoint}`);
    if (!(error instanceof Error)) {
      throw new Error('expected database error, got non-Error', { cause: error });
    }
    const dbErr = error as DatabaseError;
    return { code: dbErr.code, message: dbErr.message };
  }
  await client.query(`release savepoint ${savepoint}`);
  throw new Error('expected statement to fail, but it succeeded');
}

const CATALOGUE_TABLES = [
  'categories',
  'category_images',
  'product_images',
  'product_variants',
  'products',
];

const NON_CATALOGUE_TABLES = [
  'addresses',
  'audit_log',
  'email_outbox',
  'fabrication_requests',
  'inventory',
  'order_items',
  'orders',
  'profiles',
  'sessions',
];

const EXPECTED_FUNCTIONS = [
  'attach_product_image',
  'create_order',
  'decrement_variant_inventory',
  'remove_product_image',
  'set_primary_product_image',
  'set_updated_at',
  'storage_image_url',
];

describeWithStack('phase 7 grants and access control', () => {
  describe('auth.uid() policy audit', () => {
    it('contains zero policies whose definition references auth.uid() in public', async () => {
      const result = await pool.query<{
        tablename: string;
        policyname: string;
        qual: string | null;
        with_check: string | null;
      }>(
        `select tablename::text, policyname::text, qual::text, with_check::text
           from pg_policies
          where schemaname = 'public'
            and (
              coalesce(qual, '') ~* 'auth\\.uid\\(\\)'
              or coalesce(with_check, '') ~* 'auth\\.uid\\(\\)'
            )`,
      );

      // Standalone Google OAuth means auth.uid() is always null, so any such policy
      // is decorative and gives an illusion of security the database cannot provide.
      expect(result.rows).toEqual([]);
    });
  });

  describe('generic service_role table grants', () => {
    it('grants service_role required privileges across every base table in public', async () => {
      const result = await pool.query<{
        table_name: string;
        privileges: string;
      }>(
        `select table_name::text,
                array_to_string(
                  array_agg(distinct privilege_type::text order by privilege_type::text),
                  ','
                ) as privileges
           from information_schema.role_table_grants
          where table_schema = 'public'
            and grantee = 'service_role'
            and table_name in (
              select table_name from information_schema.tables
               where table_schema = 'public' and table_type = 'BASE TABLE'
            )
          group by table_name
          order by table_name`,
      );

      const tableGrants = new Map(result.rows.map((r) => [r.table_name, r.privileges.split(',')]));

      // All tables except audit_log must have full CRUD for service_role
      const allTables = await pool.query<{ table_name: string }>(
        `select table_name::text from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
      );

      for (const { table_name } of allTables.rows) {
        const privileges = tableGrants.get(table_name) ?? [];
        if (table_name === 'audit_log') {
          // Append-only table: SELECT, INSERT only (no UPDATE or DELETE)
          expect(privileges.sort()).toEqual(['INSERT', 'SELECT']);
        } else {
          expect(privileges.sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
        }
      }
    });

    it('grants service_role SELECT on every view in public', async () => {
      const views = await pool.query<{ table_name: string }>(
        `select table_name::text from information_schema.views where table_schema = 'public' order by table_name`,
      );

      const result = await pool.query<{
        table_name: string;
        privilege_type: string;
      }>(
        `select table_name::text, privilege_type::text
           from information_schema.role_table_grants
          where table_schema = 'public'
            and grantee = 'service_role'
            and table_name in (
              select table_name from information_schema.views where table_schema = 'public'
            )
            and privilege_type = 'SELECT'`,
      );

      const grantedViews = new Set(result.rows.map((r) => r.table_name));
      for (const view of views.rows) {
        expect(grantedViews.has(view.table_name)).toBe(true);
      }
    });

    it('grants service_role USAGE on every sequence in public', async () => {
      const sequences = await pool.query<{ sequence_name: string }>(
        `select sequence_name::text from information_schema.sequences where sequence_schema = 'public' order by sequence_name`,
      );

      const result = await pool.query<{ object_name: string }>(
        `select object_name::text
           from information_schema.role_usage_grants
          where object_schema = 'public'
            and object_type = 'SEQUENCE'
            and grantee = 'service_role'
          order by object_name`,
      );

      const grantedSequences = new Set(result.rows.map((r) => r.object_name));
      for (const seq of sequences.rows) {
        expect(grantedSequences.has(seq.sequence_name)).toBe(true);
      }
    });

    it('grants service_role EXECUTE on all required API functions', async () => {
      const result = await pool.query<{ specific_name: string }>(
        `select specific_name::text
           from information_schema.role_routine_grants
          where specific_schema = 'public'
            and grantee = 'service_role'
            and privilege_type = 'EXECUTE'
          order by specific_name`,
      );

      const functions = result.rows.map((row) => row.specific_name.replace(/_\d+$/, ''));
      for (const expected of EXPECTED_FUNCTIONS) {
        expect(functions).toContain(expected);
      }
    });
  });

  describe('role boundaries and 42501 denials', () => {
    it('allows anon to SELECT from catalogue tables and security_invoker public views', async () => {
      await withRolledBackClient(async (client) => {
        await client.query('set local role anon');

        for (const table of CATALOGUE_TABLES) {
          const res = await client.query(`select count(*) from public.${table}`);
          expect(res.rows).toBeDefined();
        }

        const views = ['category_images_public', 'products_public', 'product_images_public'];
        for (const view of views) {
          const res = await client.query(`select count(*) from public.${view}`);
          expect(res.rows).toBeDefined();
        }
      });
    });

    it('denies anon all access to non-catalogue tables with SQLSTATE 42501', async () => {
      await withRolledBackClient(async (client) => {
        await client.query('set local role anon');

        for (const table of NON_CATALOGUE_TABLES) {
          const failure = await captureSqlError(client, () =>
            client.query(`select count(*) from public.${table}`),
          );
          expect(failure.code).toBe('42501');
        }
      });
    });

    it('denies anon write access on catalogue tables with SQLSTATE 42501', async () => {
      await withRolledBackClient(async (client) => {
        await client.query('set local role anon');

        const insertFail = await captureSqlError(client, () =>
          client.query(
            `insert into public.categories (name, slug) values ('Probe', 'probe')`,
          ),
        );
        expect(insertFail.code).toBe('42501');

        const updateFail = await captureSqlError(client, () =>
          client.query(`update public.products set base_price = 0`),
        );
        expect(updateFail.code).toBe('42501');

        const deleteFail = await captureSqlError(client, () =>
          client.query(`delete from public.products`),
        );
        expect(deleteFail.code).toBe('42501');
      });
    });

    it('denies anon direct execution of sensitive RPCs with SQLSTATE 42501', async () => {
      await withRolledBackClient(async (client) => {
        await client.query('set local role anon');

        const failure = await captureSqlError(client, () =>
          client.query(
            `select public.decrement_variant_inventory($1, 1)`,
            [randomUUID()],
          ),
        );
        expect(failure.code).toBe('42501');
      });
    });
  });
});

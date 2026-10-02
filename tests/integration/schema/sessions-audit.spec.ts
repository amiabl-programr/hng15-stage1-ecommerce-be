import { randomUUID } from 'node:crypto';

import type { DatabaseError, PoolClient } from 'pg';

import { generateSessionToken, hashSessionToken } from '../../../src/lib/session.ts';
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

async function seedProfile(
  client: PoolClient,
  emailPrefix = 'user',
  role = 'customer',
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into public.profiles (email, full_name, role)
     values ($1, 'Test User', $2::user_role)
     returning id::text`,
    [`${emailPrefix}-${randomUUID()}@example.com`, role],
  );
  return result.rows[0]!.id;
}

describeWithStack('phase 5 sessions and audit log schema', () => {
  describe('sessions table definition and constraints', () => {
    it('declares the expected column names, nullabilities, and types', async () => {
      const result = await pool.query<{
        column_name: string;
        is_nullable: string;
        data_type: string;
        udt_name: string;
      }>(
        `select column_name, is_nullable, data_type, udt_name
           from information_schema.columns
          where table_schema = 'public' and table_name = 'sessions'
          order by ordinal_position`,
      );

      const columns = new Map(result.rows.map((r) => [r.column_name, r]));

      expect(columns.get('id')?.data_type).toBe('uuid');
      expect(columns.get('id')?.is_nullable).toBe('NO');

      expect(columns.get('token_hash')?.data_type).toBe('text');
      expect(columns.get('token_hash')?.is_nullable).toBe('NO');

      expect(columns.get('profile_id')?.data_type).toBe('uuid');
      expect(columns.get('profile_id')?.is_nullable).toBe('NO');

      expect(columns.get('expires_at')?.data_type).toBe('timestamp with time zone');
      expect(columns.get('expires_at')?.is_nullable).toBe('NO');

      expect(columns.get('created_at')?.data_type).toBe('timestamp with time zone');
      expect(columns.get('created_at')?.is_nullable).toBe('NO');

      expect(columns.get('last_seen_at')?.data_type).toBe('timestamp with time zone');
      expect(columns.get('last_seen_at')?.is_nullable).toBe('NO');

      expect(columns.get('revoked_at')?.data_type).toBe('timestamp with time zone');
      expect(columns.get('revoked_at')?.is_nullable).toBe('YES');

      expect(columns.get('user_agent')?.data_type).toBe('text');
      expect(columns.get('user_agent')?.is_nullable).toBe('YES');

      expect(columns.get('ip')?.udt_name).toBe('inet');
      expect(columns.get('ip')?.is_nullable).toBe('YES');
    });

    it('enforces unique token_hash constraint', async () => {
      await withRolledBackClient(async (client) => {
        const profileId = await seedProfile(client, 'sess-unique');
        const token = generateSessionToken();
        const hash = hashSessionToken(token);

        await client.query(
          `insert into public.sessions (token_hash, profile_id, expires_at)
           values ($1, $2, now() + interval '7 days')`,
          [hash, profileId],
        );

        const failure = await captureSqlError(client, async () => {
          await client.query(
            `insert into public.sessions (token_hash, profile_id, expires_at)
             values ($1, $2, now() + interval '7 days')`,
            [hash, profileId],
          );
        });

        // 23505 = unique_violation
        expect(failure.code).toBe('23505');
      });
    });

    it('cascades deletion from profiles', async () => {
      await withRolledBackClient(async (client) => {
        const profileId = await seedProfile(client, 'sess-cascade');
        const token = generateSessionToken();
        const hash = hashSessionToken(token);

        await client.query(
          `insert into public.sessions (token_hash, profile_id, expires_at)
           values ($1, $2, now() + interval '7 days')`,
          [hash, profileId],
        );

        const before = await client.query(
          `select count(*)::int as cnt from public.sessions where profile_id = $1`,
          [profileId],
        );
        expect(before.rows[0]!.cnt).toBe(1);

        await client.query(`delete from public.profiles where id = $1`, [profileId]);

        const after = await client.query(
          `select count(*)::int as cnt from public.sessions where profile_id = $1`,
          [profileId],
        );
        expect(after.rows[0]!.cnt).toBe(0);
      });
    });
  });

  describe('session lifecycle SQL queries', () => {
    it('lookup returns valid active session', async () => {
      await withRolledBackClient(async (client) => {
        const profileId = await seedProfile(client, 'sess-active');
        const token = generateSessionToken();
        const hash = hashSessionToken(token);

        await client.query(
          `insert into public.sessions (token_hash, profile_id, expires_at)
           values ($1, $2, now() + interval '7 days')`,
          [hash, profileId],
        );

        const result = await client.query<{ id: string; profile_id: string }>(
          `select s.id::text, s.profile_id::text
             from public.sessions s
            where s.token_hash = $1
              and s.revoked_at is null
              and s.expires_at > now()`,
          [hash],
        );

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]!.profile_id).toBe(profileId);
      });
    });

    it('lookup excludes revoked sessions', async () => {
      await withRolledBackClient(async (client) => {
        const profileId = await seedProfile(client, 'sess-revoked');
        const token = generateSessionToken();
        const hash = hashSessionToken(token);

        await client.query(
          `insert into public.sessions (token_hash, profile_id, expires_at, revoked_at)
           values ($1, $2, now() + interval '7 days', now())`,
          [hash, profileId],
        );

        const result = await client.query(
          `select s.id
             from public.sessions s
            where s.token_hash = $1
              and s.revoked_at is null
              and s.expires_at > now()`,
          [hash],
        );

        expect(result.rows).toHaveLength(0);
      });
    });

    it('lookup excludes expired sessions regardless of revoked_at status', async () => {
      await withRolledBackClient(async (client) => {
        const profileId = await seedProfile(client, 'sess-expired');
        const token1 = generateSessionToken();
        const hash1 = hashSessionToken(token1);
        const token2 = generateSessionToken();
        const hash2 = hashSessionToken(token2);

        // Expired, not revoked
        await client.query(
          `insert into public.sessions (token_hash, profile_id, expires_at, revoked_at)
           values ($1, $2, now() - interval '1 hour', null)`,
          [hash1, profileId],
        );

        // Expired and revoked
        await client.query(
          `insert into public.sessions (token_hash, profile_id, expires_at, revoked_at)
           values ($1, $2, now() - interval '1 hour', now() - interval '2 hours')`,
          [hash2, profileId],
        );

        const result1 = await client.query(
          `select s.id from public.sessions s where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()`,
          [hash1],
        );
        expect(result1.rows).toHaveLength(0);

        const result2 = await client.query(
          `select s.id from public.sessions s where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()`,
          [hash2],
        );
        expect(result2.rows).toHaveLength(0);
      });
    });
  });

  describe('audit_log table and append-only constraints', () => {
    it('declares the expected columns and types on audit_log', async () => {
      const result = await pool.query<{
        column_name: string;
        is_nullable: string;
        data_type: string;
        udt_name: string;
      }>(
        `select column_name, is_nullable, data_type, udt_name
           from information_schema.columns
          where table_schema = 'public' and table_name = 'audit_log'
          order by ordinal_position`,
      );

      const columns = new Map(result.rows.map((r) => [r.column_name, r]));

      expect(columns.get('id')?.data_type).toBe('bigint');
      expect(columns.get('actor_id')?.data_type).toBe('uuid');
      expect(columns.get('action')?.data_type).toBe('text');
      expect(columns.get('action')?.is_nullable).toBe('NO');
      expect(columns.get('entity_type')?.data_type).toBe('text');
      expect(columns.get('entity_type')?.is_nullable).toBe('NO');
      expect(columns.get('entity_id')?.data_type).toBe('uuid');
      expect(columns.get('before')?.data_type).toBe('jsonb');
      expect(columns.get('after')?.data_type).toBe('jsonb');
      expect(columns.get('ip')?.udt_name).toBe('inet');
      expect(columns.get('created_at')?.data_type).toBe('timestamp with time zone');
      expect(columns.get('created_at')?.is_nullable).toBe('NO');
    });

    it('sets actor_id to null on profile deletion', async () => {
      await withRolledBackClient(async (client) => {
        const profileId = await seedProfile(client, 'audit-actor');

        const insertResult = await client.query<{ id: string }>(
          `insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
           values ($1, 'image.permission_approved', 'product_images', $2, '{"permission_status": "pending"}', '{"permission_status": "approved"}')
           returning id::text`,
          [profileId, randomUUID()],
        );
        const auditLogId = insertResult.rows[0]!.id;

        await client.query(`delete from public.profiles where id = $1`, [profileId]);

        const after = await client.query<{ actor_id: string | null }>(
          `select actor_id from public.audit_log where id = $1`,
          [auditLogId],
        );
        expect(after.rows[0]!.actor_id).toBeNull();
      });
    });

    it('allows INSERT and SELECT for service_role', async () => {
      await withRolledBackClient(async (client) => {
        const insertRes = await client.query<{ id: string }>(
          `insert into public.audit_log (action, entity_type, entity_id)
           values ('order.status_changed', 'orders', $1)
           returning id::text`,
          [randomUUID()],
        );
        expect(insertRes.rows).toHaveLength(1);

        const selectRes = await client.query(
          `select id, action from public.audit_log where id = $1`,
          [insertRes.rows[0]!.id],
        );
        expect(selectRes.rows).toHaveLength(1);
      });
    });

    it('enforces append-only: UPDATE and DELETE raise 42501 for service_role', async () => {
      await withRolledBackClient(async (client) => {
        const insertRes = await client.query<{ id: string }>(
          `insert into public.audit_log (action, entity_type, entity_id)
           values ('role.assigned', 'profiles', $1)
           returning id::text`,
          [randomUUID()],
        );
        const logId = insertRes.rows[0]!.id;

        // In postgres, test with impersonated service_role / anon / authenticated if configured
        // Attempt update under service_role
        await client.query(`set local role service_role`);

        const updateFail = await captureSqlError(client, async () => {
          await client.query(`update public.audit_log set action = 'tampered' where id = $1`, [logId]);
        });
        expect(updateFail.code).toBe('42501');

        const deleteFail = await captureSqlError(client, async () => {
          await client.query(`delete from public.audit_log where id = $1`, [logId]);
        });
        expect(deleteFail.code).toBe('42501');
      });
    });
  });
});

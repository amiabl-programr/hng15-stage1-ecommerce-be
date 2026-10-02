import { randomUUID } from 'node:crypto';

import type { DatabaseError, PoolClient } from 'pg';

import { describeWithStack, pool } from '../support/stack.ts';

/**
 * Phase 3 asserts the base schema against the live database. Nothing here creates,
 * alters or drops anything: the schema was applied with `supabase db query` and these
 * tests are the evidence that what was applied is what was specified.
 *
 * Every test that writes runs inside BEGIN … ROLLBACK on a dedicated client and is
 * never committed, so a green run leaves the hosted database byte-identical. Nothing
 * is truncated and nothing pre-existing is deleted. Role switching is `SET LOCAL
 * ROLE`, which is scoped to the transaction and dies with the rollback, so no client
 * can leak an impersonated role into the next test.
 */

const EXPECTED_TABLES = [
  'addresses',
  'categories',
  'category_images',
  'fabrication_requests',
  'inventory',
  'order_items',
  'orders',
  'product_images',
  'product_variants',
  'products',
  'profiles',
];

const EXPECTED_ENUMS = [
  'image_role',
  'order_status',
  'payment_method',
  'payment_status',
  'permission_status',
  'product_type',
  'profile_kind',
  'unit_type',
  'user_role',
];

const CATALOGUE_TABLES = [
  'categories',
  'category_images',
  'product_images',
  'product_variants',
  'products',
];

/**
 * Zero policies by design. notes.md §1: auth is standalone Google OAuth, so
 * `auth.uid()` is always null and a policy keyed on it can never match. Authorization
 * is an application concern (§4), so these tables are reachable only by service_role.
 */
const SERVICE_ROLE_ONLY_TABLES = [
  'addresses',
  'fabrication_requests',
  'inventory',
  'order_items',
  'orders',
  'profiles',
];

const EXPECTED_POLICIES = [
  {
    tablename: 'categories',
    policyname: 'catalogue_read_categories',
    permissive: 'PERMISSIVE',
    roles: '{anon,authenticated}',
    cmd: 'SELECT',
    qual: 'true',
  },
  {
    tablename: 'category_images',
    policyname: 'catalogue_read_category_images',
    permissive: 'PERMISSIVE',
    roles: '{anon,authenticated}',
    cmd: 'SELECT',
    qual: 'true',
  },
  {
    tablename: 'product_images',
    policyname: 'catalogue_read_product_images',
    permissive: 'PERMISSIVE',
    roles: '{anon,authenticated}',
    cmd: 'SELECT',
    qual: 'true',
  },
  {
    tablename: 'product_variants',
    policyname: 'catalogue_read_product_variants',
    permissive: 'PERMISSIVE',
    roles: '{anon,authenticated}',
    cmd: 'SELECT',
    qual: 'true',
  },
  {
    tablename: 'products',
    policyname: 'catalogue_read_products',
    permissive: 'PERMISSIVE',
    roles: '{anon,authenticated}',
    cmd: 'SELECT',
    qual: 'true',
  },
];

/**
 * Whole naira in a bigint. There is no currency column and no conversion anywhere in
 * the system, so every money column is one of these two.
 */
const MONEY_COLUMNS = [
  ['orders', 'delivery_fee'],
  ['orders', 'subtotal'],
  ['orders', 'total_amount'],
  ['order_items', 'line_total'],
  ['order_items', 'unit_price'],
  ['product_variants', 'price_override'],
  ['products', 'base_price'],
] as const;

const EXPECTED_CHECK_CONSTRAINTS = [
  'inventory_quantity_nonnegative',
  'order_items_line_total_matches',
  'order_items_line_total_nonnegative',
  'order_items_quantity_positive',
  'order_items_unit_price_nonnegative',
  'orders_delivery_fee_nonnegative',
  'orders_subtotal_nonnegative',
  'orders_total_matches',
  'orders_total_nonnegative',
  'product_variants_price_override_nonnegative',
  'product_variants_stock_nonnegative',
  'products_base_price_nonnegative',
  'products_min_order_quantity_positive',
];

/**
 * Every foreign key column is the leading column of some index. Postgres does not
 * create these automatically and an unindexed FK makes every parent delete a
 * sequential scan of the child.
 */
const EXPECTED_FK_COLUMNS = [
  'addresses.profile_id',
  'category_images.category_id',
  'category_images.uploaded_by',
  'fabrication_requests.order_item_id',
  'fabrication_requests.profile_id',
  'inventory.product_id',
  'inventory.variant_id',
  'order_items.order_id',
  'order_items.product_id',
  'order_items.variant_id',
  'orders.profile_id',
  'product_images.product_id',
  'product_images.uploaded_by',
  'product_variants.product_id',
  'products.category_id',
];

/** Exact row count of every public table, keyed by table name. */
const ROW_COUNT_SQL = `
  select jsonb_build_object(
           'addresses', (select count(*) from public.addresses),
           'categories', (select count(*) from public.categories),
           'category_images', (select count(*) from public.category_images),
           'fabrication_requests', (select count(*) from public.fabrication_requests),
           'inventory', (select count(*) from public.inventory),
           'order_items', (select count(*) from public.order_items),
           'orders', (select count(*) from public.orders),
           'product_images', (select count(*) from public.product_images),
           'product_variants', (select count(*) from public.product_variants),
           'products', (select count(*) from public.products),
           'profiles', (select count(*) from public.profiles)
         )::text as counts`;

describeWithStack('phase 3 base schema', () => {
  /**
   * Row counts of all ten tables, taken before the first write, so the isolation check
   * compares against the real starting state rather than an assumption that the hosted
   * database is empty.
   */
  let countsBefore: unknown = {};

  beforeAll(async () => {
    const result = await pool.query<{ counts: string }>(ROW_COUNT_SQL);

    countsBefore = JSON.parse(result.rows[0]?.counts ?? '{}');
  });

  describe('tables and enums', () => {
    it('contains exactly the ten tables from notes.md section 1', async () => {
      const result = await pool.query<{ tablename: string }>(
        `select tablename::text
           from pg_tables
          where schemaname = 'public'
          order by tablename`,
      );

      // Exact set equality, not a subset check: an eleventh table nobody specified is
      // as much a defect as a missing one, because it is the one nobody reviewed.
      expect(result.rows.map((row) => row.tablename)).toEqual(EXPECTED_TABLES);
    });

    it('contains exactly the six enum types', async () => {
      const result = await pool.query<{ typname: string }>(
        `select t.typname::text
           from pg_type t
           join pg_namespace n on n.oid = t.typnamespace
          where n.nspname = 'public'
            and t.typtype = 'e'
          order by t.typname`,
      );

      expect(result.rows.map((row) => row.typname)).toEqual(EXPECTED_ENUMS);
    });

    it('restricts table grants to anon, authenticated and service_role', async () => {
      const result = await pool.query<{ grantee: string }>(
        `select distinct grantee
           from information_schema.role_table_grants
          where table_schema = 'public'
          order by grantee`,
      );

      expect(result.rows.map((row) => row.grantee)).toEqual([
        'anon',
        'authenticated',
        'postgres',
        'service_role',
      ]);
    });

    it('stores money as whole naira in bigint and keeps no fractional column', async () => {
      const money = await pool.query<{
        table_name: string;
        column_name: string;
        udt_name: string;
      }>(
        `select c.table_name::text, c.column_name::text, c.udt_name::text
           from information_schema.columns c
          where c.table_schema = 'public'
            and (c.table_name, c.column_name) in (
              select * from unnest($1::text[], $2::text[])
            )`,
        [
          MONEY_COLUMNS.map(([table]) => table),
          MONEY_COLUMNS.map(([, column]) => column),
        ],
      );

      expect(
        money.rows.map((row) => `${row.table_name}.${row.column_name}`).sort(),
      ).toEqual(
        MONEY_COLUMNS.map(([table, column]) => `${table}.${column}`).sort(),
      );
      for (const row of money.rows) {
        expect(`${row.table_name}.${row.column_name}=${row.udt_name}`).toMatch(
          /=int8$/,
        );
      }

      const fractional = await pool.query<{
        table_name: string;
        column_name: string;
      }>(
        `select table_name::text, column_name::text
           from information_schema.columns
          where table_schema = 'public'
            and data_type in ('numeric', 'money', 'real', 'double precision')
          order by table_name, column_name`,
      );

      expect(fractional.rows).toEqual([]);
    });

    it('has no currency column anywhere in public', async () => {
      const result = await pool.query<{
        table_name: string;
        column_name: string;
      }>(
        `select table_name::text, column_name::text
           from information_schema.columns
          where table_schema = 'public'
            and column_name ~* 'currency|kobo|naira|exchange'
          order by table_name, column_name`,
      );

      expect(result.rows).toEqual([]);
    });

    it('defaults products.min_order_quantity to 1', async () => {
      const result = await pool.query<{
        column_default: string | null;
        udt_name: string;
      }>(
        `select column_default::text, udt_name::text
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'products'
            and column_name = 'min_order_quantity'`,
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.udt_name).toBe('int4');
      expect(result.rows[0]?.column_default).toBe('1');
    });

    it('rejects products.min_order_quantity below 1', async () => {
      await withRolledBackClient(async (client) => {
        const category = await seedCategory(client, 'min-order-quantity');

        const failure = await captureSqlError(client, () =>
          client.query(
            `insert into public.products
               (category_id, name, slug, description, base_price, min_order_quantity)
             values ($1, 'moq probe', 'moq-probe', 'd', 100, 0)`,
            [category],
          ),
        );

        expect(failure.code).toBe('23514');
        expect(failure.message).toContain(
          'products_min_order_quantity_positive',
        );
      });
    });

    it('defaults products.min_order_quantity to 1 on an inserted row', async () => {
      await withRolledBackClient(async (client) => {
        const category = await seedCategory(client, 'min-order-default');

        const result = await client.query<{
          min_order_quantity: number;
          base_price: string;
        }>(
          `insert into public.products (category_id, name, slug, description, base_price)
           values ($1, 'default probe', 'default-probe', 'd', 4500000)
           returning min_order_quantity, base_price`,
          [category],
        );

        expect(result.rows[0]?.min_order_quantity).toBe(1);
        // bigint arrives as a string so it survives a value beyond 2^53.
        expect(result.rows[0]?.base_price).toBe('4500000');
      });
    });
  });

  describe('row level security', () => {
    it('enables RLS on all ten tables', async () => {
      const result = await pool.query<{
        tablename: string;
        relrowsecurity: boolean;
      }>(
        `select t.tablename::text, c.relrowsecurity
           from pg_tables t
           join pg_class c on c.relname = t.tablename
           join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
          where t.schemaname = 'public'
          order by t.tablename`,
      );

      expect(
        result.rows.map(
          (row) => `${row.tablename}=${String(row.relrowsecurity)}`,
        ),
      ).toEqual(EXPECTED_TABLES.map((table) => `${table}=true`));
    });

    it('creates exactly four policies, all permissive catalogue SELECTs', async () => {
      const result = await pool.query<{
        tablename: string;
        policyname: string;
        permissive: string;
        roles: string;
        cmd: string;
        qual: string;
      }>(
        `select tablename::text, policyname::text, permissive::text,
                roles::text, cmd::text, qual::text
           from pg_policies
          where schemaname = 'public'
          order by tablename, policyname`,
      );

      expect(result.rows).toEqual(EXPECTED_POLICIES);
    });

    it('leaves no policy on any service-role-only table', async () => {
      const result = await pool.query<{
        tablename: string;
        policyname: string;
      }>(
        `select tablename::text, policyname::text
           from pg_policies
          where schemaname = 'public'
            and tablename = any ($1::text[])`,
        [SERVICE_ROLE_ONLY_TABLES],
      );

      expect(result.rows).toEqual([]);
    });

    it('lets anon read the whole catalogue, and only the catalogue', async () => {
      await withRolledBackClient(async (client) => {
        const privileged = await client.query<{
          products: string;
          categories: string;
        }>(
          `select (select count(*) from public.products)::text as products,
                  (select count(*) from public.categories)::text as categories`,
        );

        await client.query('set local role anon');

        const result = await client.query<{
          products: string;
          categories: string;
        }>(
          `select (select count(*) from public.products)::text as products,
                  (select count(*) from public.categories)::text as categories`,
        );

        expect(result.rows[0]).toEqual(privileged.rows[0]);

        const failure = await captureSqlError(client, () =>
          client.query('select count(*) from public.order_items'),
        );

        expect(failure.code).toBe('42501');
      });
    });

    it('hides profiles from anon even though RLS is enabled and no policy exists', async () => {
      await withRolledBackClient(async (client) => {
        await client.query('set local role anon');

        const failure = await captureSqlError(client, () =>
          client.query('select count(*) from public.profiles'),
        );

        // No policy means no GRANT either, so this never reaches the RLS check.
        expect(failure.code).toBe('42501');
      });
    });
  });

  describe('grants', () => {
    it('grants anon and authenticated SELECT on the four catalogue tables only', async () => {
      const result = await pool.query<{
        grantee: string;
        table_name: string;
        privileges: string;
      }>(
        `select grantee::text, table_name::text,
                array_to_string(
                  array_agg(privilege_type::text order by privilege_type::text),
                  ','
                ) as privileges
           from information_schema.role_table_grants
          where table_schema = 'public'
            and grantee in ('anon', 'authenticated')
            and table_name in (
              select table_name from information_schema.tables
               where table_schema = 'public' and table_type = 'BASE TABLE'
            )
            and privilege_type = 'SELECT'
          group by grantee, table_name
          order by grantee, table_name`,
      );

      const selectGrants = result.rows.map(
        (row) => `${row.grantee}:${row.table_name}`,
      );
      const expected = ['anon', 'authenticated'].flatMap((role) =>
        CATALOGUE_TABLES.map((table) => `${role}:${table}`),
      );
      expect(selectGrants.sort()).toEqual(expected.sort());
    });

    it('withholds every write privilege from anon and authenticated', async () => {
      const result = await pool.query<{
        table_name: string;
        grantee: string;
        privileges: string;
      }>(
        `select table_name::text, grantee::text,
                array_to_string(
                  array_agg(distinct privilege_type::text order by privilege_type::text),
                  ','
                ) as privileges
           from information_schema.role_table_grants
          where table_schema = 'public'
            and grantee in ('anon', 'authenticated')
            and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
          group by table_name, grantee
          order by table_name, grantee`,
      );

      expect(result.rows).toEqual([]);
    });

    it('holds anon and authenticated to exactly SELECT and nothing else', async () => {
      const result = await pool.query<{
        grantee: string;
        table_name: string;
        privileges: string;
      }>(
        `select grantee::text, table_name::text,
                array_to_string(
                  array_agg(privilege_type::text order by privilege_type::text),
                  ','
                ) as privileges
           from information_schema.role_table_grants
          where table_schema = 'public'
            and grantee in ('anon', 'authenticated')
          group by grantee, table_name
          order by grantee, table_name`,
      );

      // The whole grant set for both roles, not a SELECT-shaped slice of it. Supabase
      // ships `grant all on all tables in schema public to anon, authenticated`, and ALL
      // includes TRUNCATE — which RLS does not govern, so anon could have emptied a table
      // that has no policy at all without any policy ever being consulted. Asserted per
      // relation and without a hardcoded catalogue list, so it survives a table being
      // added and still fails the moment a second privilege appears anywhere.
      const grants = result.rows.map(
        (row) => `${row.grantee}:${row.table_name}=${row.privileges}`,
      );

      expect(grants.filter((grant) => !grant.endsWith('=SELECT'))).toEqual([]);

      // The tables that are service_role's alone produce no row at all: the view has one
      // row per (grantee, relation, privilege), so absent from it means no privilege of
      // any kind, not merely no write privilege.
      const owned = new Set(SERVICE_ROLE_ONLY_TABLES);
      expect(
        grants.filter((grant) =>
          owned.has(grant.split(':')[1]?.split('=')[0] ?? ''),
        ),
      ).toEqual([]);

      // And the two roles are held to the same standard, so neither can be widened alone.
      const relationsFor = (grantee: string): string[] =>
        grants
          .filter((grant) => grant.startsWith(`${grantee}:`))
          .map((grant) => grant.slice(grantee.length + 1));

      expect(relationsFor('anon')).toEqual(relationsFor('authenticated'));
    });

    it('grants anon and authenticated no TRUNCATE on any table', async () => {
      const result = await pool.query<{ grantee: string; table_name: string }>(
        `select grantee::text, table_name::text
           from information_schema.role_table_grants
          where table_schema = 'public'
            and grantee in ('anon', 'authenticated')
            and privilege_type = 'TRUNCATE'
          order by grantee, table_name`,
      );

      expect(result.rows).toEqual([]);
    });

    it('refuses a TRUNCATE as anon with SQLSTATE 42501, where RLS would not have', async () => {
      await withRolledBackClient(async (client) => {
        await client.query('set local role anon');

        // TRUNCATE never reaches the RLS check, so a policy-based defence would be no
        // defence at all here. Only the absence of the privilege stops it, and the
        // rollback means even a bug in this assertion cannot empty a table.
        const failure = await captureSqlError(client, () =>
          client.query('truncate table public.orders'),
        );

        expect(failure.code).toBe('42501');
        expect(failure.message).toContain('permission denied for table orders');
      });
    });

    it('grants service_role SELECT, INSERT, UPDATE and DELETE on all base tables', async () => {
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
            and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
          group by table_name
          order by table_name`,
      );

      const required = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'];
      expect(result.rows.map((row) => row.table_name)).toEqual(EXPECTED_TABLES);
      for (const row of result.rows) {
        expect(row.privileges.split(',').sort()).toEqual(required);
      }
    });

    it('grants service_role USAGE on every sequence in public', async () => {
      const result = await pool.query<{
        object_name: string;
        object_type: string;
      }>(
        `select object_name::text, object_type::text
           from information_schema.role_usage_grants
          where object_schema = 'public'
            and object_type = 'SEQUENCE'
            and grantee = 'service_role'
          order by object_name`,
      );

      const sequences = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from information_schema.sequences
          where sequence_schema = 'public'`,
      );

      // Every primary key is gen_random_uuid(), so public currently has no sequences at
      // all and this grant is vacuous. It is asserted anyway: the moment a phase adds a
      // serial column, this fails until service_role is granted USAGE on it.
      expect(result.rows).toEqual([]);
      expect(sequences.rows).toEqual([{ count: '0' }]);
    });

    it('grants service_role EXECUTE on the functions the API calls', async () => {
      const result = await pool.query<{
        specific_name: string;
        privilege_type: string;
      }>(
        `select specific_name::text, privilege_type::text
           from information_schema.role_routine_grants
          where specific_schema = 'public'
            and grantee = 'service_role'
            and privilege_type = 'EXECUTE'
          order by specific_name`,
      );

      const expected = [
        'attach_product_image',
        'decrement_variant_inventory',
        'remove_product_image',
        'set_primary_product_image',
        'set_updated_at',
        'storage_image_url',
      ];
      expect(
        result.rows.map((row) => row.specific_name.replace(/_\d+$/, '')).sort(),
      ).toEqual(expected.sort());
    });

    it('marks service_role as bypassing RLS, so it is the only role that can write', async () => {
      const result = await pool.query<{
        rolname: string;
        rolbypassrls: boolean;
      }>(
        `select rolname::text, rolbypassrls
           from pg_roles
          where rolname in ('anon', 'authenticated', 'service_role')
          order by rolname`,
      );

      expect(result.rows).toEqual([
        { rolname: 'anon', rolbypassrls: false },
        { rolname: 'authenticated', rolbypassrls: false },
        { rolname: 'service_role', rolbypassrls: true },
      ]);
    });

    it('lets service_role insert into profiles', async () => {
      await withRolledBackClient(async (client) => {
        await client.query('set local role service_role');

        const result = await client.query<{ id: string; role: string }>(
          `insert into public.profiles (email, full_name)
           values ($1, 'Phase 3 Probe')
           returning id::text, role::text`,
          [`phase3-service-${randomUUID()}@example.invalid`],
        );

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]?.role).toBe('customer');
      });
    });

    it('refuses the same insert as anon with SQLSTATE 42501', async () => {
      await withRolledBackClient(async (client) => {
        await client.query('set local role anon');

        const failure = await captureSqlError(client, () =>
          client.query(
            `insert into public.profiles (email, full_name)
             values ($1, 'Phase 3 Probe')`,
            [`phase3-anon-${randomUUID()}@example.invalid`],
          ),
        );

        expect(failure.code).toBe('42501');
      });
    });
  });

  describe('constraints and indexes', () => {
    it('names every money and quantity check constraint', async () => {
      const result = await pool.query<{ conname: string }>(
        `select con.conname::text
           from pg_constraint con
           join pg_class c on c.oid = con.conrelid
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and con.contype = 'c'
            and con.conname = any ($1::text[])
          order by con.conname`,
        [EXPECTED_CHECK_CONSTRAINTS],
      );

      expect(result.rows.map((row) => row.conname)).toEqual(
        EXPECTED_CHECK_CONSTRAINTS,
      );
    });

    it('enforces orders_total_amount = subtotal + delivery_fee', async () => {
      await withRolledBackClient(async (client) => {
        const failure = await captureSqlError(client, () =>
          client.query(
            `insert into public.orders
               (order_number, customer_name, customer_email, customer_phone,
                delivery_address, subtotal, delivery_fee, total_amount)
             values ($1, 'Probe', 'probe@example.invalid', '08000000000',
                     '{}'::jsonb, 10000, 2500, 99999)`,
            [`PROBE-${randomUUID()}`],
          ),
        );

        expect(failure.code).toBe('23514');
        expect(failure.message).toContain('orders_total_matches');
      });
    });

    it('accepts an order whose total is exactly subtotal plus delivery fee', async () => {
      await withRolledBackClient(async (client) => {
        const result = await client.query<{
          total_amount: string;
          delivery_fee: string;
        }>(
          `insert into public.orders
             (order_number, customer_name, customer_email, customer_phone,
              delivery_address, subtotal, delivery_fee, total_amount)
           values ($1, 'Probe', 'probe@example.invalid', '08000000000',
                   '{}'::jsonb, 10000, 2500, 12500)
           returning total_amount::text, delivery_fee::text`,
          [`PROBE-${randomUUID()}`],
        );

        expect(result.rows[0]?.total_amount).toBe('12500');
        expect(result.rows[0]?.delivery_fee).toBe('2500');
      });
    });

    it('enforces order_items.line_total = unit_price * quantity', async () => {
      await withRolledBackClient(async (client) => {
        const order = await seedOrder(client, 30000, 2000, 32000);

        const failure = await captureSqlError(client, () =>
          client.query(
            `insert into public.order_items
               (order_id, product_name, unit_price, quantity, line_total)
             values ($1, 'Probe item', 5000, 3, 99999)`,
            [order],
          ),
        );

        expect(failure.code).toBe('23514');
        expect(failure.message).toContain('order_items_line_total_matches');
      });
    });

    it('accepts an order item whose line total is unit price times quantity', async () => {
      await withRolledBackClient(async (client) => {
        const order = await seedOrder(client, 30000, 2000, 32000);

        const result = await client.query<{
          line_total: string;
          unit_price: string;
        }>(
          `insert into public.order_items
             (order_id, product_name, unit_price, quantity, line_total)
           values ($1, 'Probe item', 5000, 3, 15000)
           returning line_total::text, unit_price::text`,
          [order],
        );

        expect(result.rows[0]?.line_total).toBe('15000');
        expect(result.rows[0]?.unit_price).toBe('5000');
      });
    });

    it('indexes the leading column of every foreign key', async () => {
      const foreignKeys = await pool.query<{ column_ref: string }>(
        `select (c.relname::text || '.' || a.attname::text) as column_ref
           from pg_constraint con
           join pg_class c on c.oid = con.conrelid
           join pg_namespace n on n.oid = c.relnamespace
           join lateral unnest(con.conkey) as k(attnum) on true
           join pg_attribute a
             on a.attrelid = c.oid and a.attnum = k.attnum
          where n.nspname = 'public'
            and con.contype = 'f'
          order by 1`,
      );

      expect(foreignKeys.rows.map((row) => row.column_ref)).toEqual(
        EXPECTED_FK_COLUMNS,
      );

      const indexed = await pool.query<{ column_ref: string }>(
        `select distinct (c.relname::text || '.' || a.attname::text) as column_ref
           from pg_index x
           join pg_class c on c.oid = x.indrelid
           join pg_namespace n on n.oid = c.relnamespace
           join lateral unnest(x.indkey::int2[]) with ordinality as k(attnum, ord)
             on k.ord = 1
           join pg_attribute a
             on a.attrelid = c.oid and a.attnum = k.attnum
          where n.nspname = 'public'
            and x.indisvalid
          order by 1`,
      );

      const leading = new Set(indexed.rows.map((row) => row.column_ref));
      expect(
        EXPECTED_FK_COLUMNS.filter((column) => !leading.has(column)),
      ).toEqual([]);
    });
  });

  describe('decrement_variant_inventory', () => {
    it('is declared SECURITY DEFINER and returns integer', async () => {
      const result = await pool.query<{
        signature: string;
        result_type: string;
        prosecdef: boolean;
      }>(
        `select pg_get_function_identity_arguments(p.oid)::text as signature,
                pg_get_function_result(p.oid)::text as result_type,
                p.prosecdef
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = 'decrement_variant_inventory'`,
      );

      expect(result.rows).toEqual([
        {
          signature: 'p_variant_id uuid, p_quantity integer',
          result_type: 'integer',
          prosecdef: true,
        },
      ]);
    });

    it('returns the remaining stock, then raises once it is exhausted', async () => {
      await withRolledBackClient(async (client) => {
        const variant = await seedVariant(client, 2);

        const first = await client.query<{ remaining: number }>(
          'select public.decrement_variant_inventory($1, 2) as remaining',
          [variant],
        );

        expect(first.rows[0]?.remaining).toBe(0);

        const second = await captureSqlError(client, () =>
          client.query('select public.decrement_variant_inventory($1, 2)', [
            variant,
          ]),
        );

        expect(second.code).toBe('23514');
        expect(second.message).toContain('Insufficient stock for variant');

        const stock = await client.query<{ stock_quantity: number }>(
          'select stock_quantity from public.product_variants where id = $1',
          [variant],
        );

        // The failed call must not have gone negative.
        expect(stock.rows[0]?.stock_quantity).toBe(0);
      });
    });

    it('refuses a quantity of zero', async () => {
      await withRolledBackClient(async (client) => {
        const variant = await seedVariant(client, 5);

        const failure = await captureSqlError(client, () =>
          client.query('select public.decrement_variant_inventory($1, 0)', [
            variant,
          ]),
        );

        expect(failure.message).toBe('Quantity must be a positive integer');
      });
    });

    it('refuses a negative quantity', async () => {
      await withRolledBackClient(async (client) => {
        const variant = await seedVariant(client, 5);

        const failure = await captureSqlError(client, () =>
          client.query('select public.decrement_variant_inventory($1, -3)', [
            variant,
          ]),
        );

        expect(failure.message).toBe('Quantity must be a positive integer');
      });
    });

    it('reports a variant that does not exist', async () => {
      await withRolledBackClient(async (client) => {
        const missing = randomUUID();

        const failure = await captureSqlError(client, () =>
          client.query('select public.decrement_variant_inventory($1, 1)', [
            missing,
          ]),
        );

        expect(failure.message).toBe(`Variant ${missing} does not exist`);
      });
    });

    it('grants EXECUTE to service_role and to nobody else, PUBLIC included', async () => {
      const acl = await pool.query<{ items: string[] }>(
        `select p.proacl::text[] as items
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = 'decrement_variant_inventory'`,
      );

      // Postgres gives every new function EXECUTE to PUBLIC. The default is spelled
      // `=X/postgres` — an aclitem whose grantee is empty — so its absence is the fix.
      // SECURITY DEFINER means that default grant was a way for anon to make the
      // database write to inventory on its behalf with no policy in the way.
      expect(acl.rows[0]?.items).toEqual([
        'postgres=X/postgres',
        'service_role=X/postgres',
      ]);
      expect(
        acl.rows
          .flatMap((row) => row.items)
          .filter((item) => item.startsWith('=')),
      ).toEqual([]);

      const routine = await pool.query<{
        grantee: string;
        specific_name: string;
      }>(
        `select specific_name::text, grantee::text
           from information_schema.routine_privileges
          where specific_schema = 'public'
            and specific_name like 'decrement_variant_inventory%'
            and privilege_type = 'EXECUTE'
            and grantee = 'PUBLIC'`,
      );

      expect(routine.rows).toEqual([]);
    });

    it('refuses the call as anon with SQLSTATE 42501, before the body can run', async () => {
      await withRolledBackClient(async (client) => {
        await client.query('set local role anon');

        // This is the attack, not a proxy for it: a random id that matches no row, called
        // by the one role that reaches the public PostgREST surface without credentials.
        // A missing variant is what the body would report if the call were allowed
        // through, so the SQLSTATE is the only thing that distinguishes refused from
        // executed.
        const failure = await captureSqlError(client, () =>
          client.query('select public.decrement_variant_inventory($1, 1)', [
            randomUUID(),
          ]),
        );

        expect(failure.code).toBe('42501');
        expect(failure.message).toContain(
          'permission denied for function decrement_variant_inventory',
        );
      });
    });

    it('still executes as service_role, which is the role checkout calls it as', async () => {
      await withRolledBackClient(async (client) => {
        const variant = await seedVariant(client, 5);

        await client.query('set local role service_role');

        const result = await client.query<{ remaining: number }>(
          'select public.decrement_variant_inventory($1, 2) as remaining',
          [variant],
        );

        // Still executable, still SECURITY DEFINER, still writing: the revoke took PUBLIC
        // away and left the intended holder intact.
        expect(result.rows[0]?.remaining).toBe(3);
      });
    });
  });

  describe('functions and storage', () => {
    it('defines public.set_updated_at', async () => {
      const result = await pool.query<{ proname: string }>(
        `select proname::text
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and proname = 'set_updated_at'`,
      );

      expect(result.rows).toEqual([{ proname: 'set_updated_at' }]);
    });

    it('does not define public.is_admin', async () => {
      const result = await pool.query<{ count: number }>(
        `select count(*)::int as count
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and proname = 'is_admin'`,
      );

      expect(result.rows).toEqual([{ count: 0 }]);
    });

    it('keeps the products storage bucket public', async () => {
      const result = await pool.query<{ name: string; public: boolean }>(
        'select name::text, public from storage.buckets where id = $1',
        ['products'],
      );

      expect(result.rows).toEqual([{ name: 'products', public: true }]);
    });
  });

  describe('isolation', () => {
    it('has committed nothing after the whole suite', async () => {
      const result = await pool.query<{ counts: string }>(ROW_COUNT_SQL);

      // Every write above ran inside BEGIN … ROLLBACK, so all ten row counts are
      // exactly what they were before the suite started. Nothing was truncated and
      // nothing that predates the suite was touched.
      expect(JSON.parse(result.rows[0]?.counts ?? '{}')).toEqual(countsBefore);
    });
  });
});

/**
 * Opens a dedicated client, wraps the body in an explicit transaction and always
 * rolls back. There is deliberately no commit path: a test in this file cannot write
 * to the hosted database even by accident.
 */
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

interface SqlFailure {
  code: string | undefined;
  message: string;
}

/**
 * A failed statement aborts the whole transaction, so every assertion that expects an
 * error needs a savepoint to keep the rest of its transaction usable.
 */
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
    return toSqlFailure(error);
  }
  await client.query(`release savepoint ${savepoint}`);
  throw new Error('expected the statement to raise, but it succeeded');
}

function toSqlFailure(error: unknown): SqlFailure {
  if (!(error instanceof Error)) {
    throw new Error('expected a database error, got a non-Error throw');
  }
  const database = error as DatabaseError;
  return { code: database.code, message: database.message };
}

async function seedCategory(
  client: PoolClient,
  label: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into public.categories (name, slug)
     values ($1, $2)
     returning id::text`,
    [`Phase 3 ${label}`, `phase3-${label}-${randomUUID()}`],
  );
  return requireRow(result.rows[0], 'category id');
}

async function seedVariant(client: PoolClient, stock: number): Promise<string> {
  const category = await seedCategory(client, `stock-${stock}`);
  const product = await client.query<{ id: string }>(
    `insert into public.products (category_id, name, slug, description, base_price)
     values ($1, 'Probe product', $2, 'Probe', 100000)
     returning id::text`,
    [category, `phase3-product-${randomUUID()}`],
  );
  const variant = await client.query<{ id: string }>(
    `insert into public.product_variants (product_id, name, sku, stock_quantity)
     values ($1, 'Probe variant', $2, $3)
     returning id::text`,
    [
      requireRow(product.rows[0], 'product id'),
      `phase3-sku-${randomUUID()}`,
      stock,
    ],
  );
  return requireRow(variant.rows[0], 'variant id');
}

async function seedOrder(
  client: PoolClient,
  subtotal: number,
  deliveryFee: number,
  total: number,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into public.orders
       (order_number, customer_name, customer_email, customer_phone,
        delivery_address, subtotal, delivery_fee, total_amount)
     values ($1, 'Probe', 'probe@example.invalid', '08000000000', '{}'::jsonb, $2, $3, $4)
     returning id::text`,
    [`PROBE-${randomUUID()}`, subtotal, deliveryFee, total],
  );
  return requireRow(result.rows[0], 'order id');
}

function requireRow(row: { id: string } | undefined, label: string): string {
  if (row === undefined) {
    throw new Error(`insert returned no ${label}`);
  }
  return row.id;
}

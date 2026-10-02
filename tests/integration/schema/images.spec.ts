import { randomUUID } from 'node:crypto';

import type { DatabaseError, PoolClient } from 'pg';

import { describeWithStack, pool } from '../support/stack.ts';

/**
 * Phase 4 asserts the image domain schema, functions, partial unique indexes,
 * and security_invoker public views against the live Postgres database.
 *
 * All mutations run inside BEGIN … ROLLBACK so the database remains clean.
 */

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

async function seedCategory(client: PoolClient, label: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into public.categories (name, slug, profile_kind)
     values ($1, $2, 'longspan')
     returning id::text`,
    [`Phase 4 Category ${label}`, `phase4-cat-${label}-${randomUUID()}`],
  );
  return result.rows[0]!.id;
}

async function seedProduct(
  client: PoolClient,
  categoryId: string,
  options?: { isActive?: boolean; profileKind?: string },
): Promise<string> {
  const isActive = options?.isActive ?? true;
  const profileKind = options?.profileKind ?? 'longspan';
  const result = await client.query<{ id: string }>(
    `insert into public.products (category_id, name, slug, description, base_price, is_active, profile_kind)
     values ($1, 'Phase 4 Product', $2, 'Description', 25000, $3, $4)
     returning id::text`,
    [categoryId, `phase4-prod-${randomUUID()}`, isActive, profileKind],
  );
  return result.rows[0]!.id;
}

describeWithStack('phase 4 image domain schema', () => {
  describe('enums and columns', () => {
    it('defines image_role, permission_status, and profile_kind enums', async () => {
      const result = await pool.query<{ typname: string; enumlabel: string }>(
        `select t.typname::text, e.enumlabel::text
           from pg_type t
           join pg_namespace n on n.oid = t.typnamespace
           join pg_enum e on e.enumtypid = t.oid
          where n.nspname = 'public'
            and t.typname in ('image_role', 'permission_status', 'profile_kind')
          order by t.typname, e.enumsortorder`,
      );

      const byType = new Map<string, string[]>();
      for (const row of result.rows) {
        const list = byType.get(row.typname) ?? [];
        list.push(row.enumlabel);
        byType.set(row.typname, list);
      }

      expect(byType.get('image_role')).toEqual(['main', 'profile', 'installed', 'detail']);
      expect(byType.get('permission_status')).toEqual(['own', 'approved', 'not-required', 'pending']);
      expect(byType.get('profile_kind')).toEqual([
        'longspan', 'metcoppo', 'step-tile', 'corrugated', 'shingle',
        'ridge', 'trimmer', 'flashing', 'gutter', 'fastener',
        'roll-forming', 'bending',
      ]);
    });

    it('defaults products.profile_kind and categories.profile_kind to longspan', async () => {
      await withRolledBackClient(async (client) => {
        const catId = await seedCategory(client, 'defaults');
        const prodId = await seedProduct(client, catId);

        const catRow = await client.query<{ profile_kind: string }>(
          'select profile_kind::text from public.categories where id = $1',
          [catId],
        );
        const prodRow = await client.query<{ profile_kind: string }>(
          'select profile_kind::text from public.products where id = $1',
          [prodId],
        );

        expect(catRow.rows[0]?.profile_kind).toBe('longspan');
        expect(prodRow.rows[0]?.profile_kind).toBe('longspan');
      });
    });

    it('enforces alt_text not null on product_images', async () => {
      await withRolledBackClient(async (client) => {
        const catId = await seedCategory(client, 'alt-null');
        const prodId = await seedProduct(client, catId);

        const failure = await captureSqlError(client, () =>
          client.query(
            `insert into public.product_images (product_id, storage_path, alt_text)
             values ($1, 'test/path.webp', null)`,
            [prodId],
          ),
        );

        expect(failure.code).toBe('23502');
      });
    });
  });

  describe('partial unique indexes', () => {
    it('enforces product_images_path_unique for non-empty paths', async () => {
      await withRolledBackClient(async (client) => {
        const catId = await seedCategory(client, 'path-unique');
        const prodId = await seedProduct(client, catId);
        const path = `products/${prodId}/image-unique-${randomUUID()}.webp`;

        await client.query(
          `insert into public.product_images (product_id, storage_path, alt_text)
           values ($1, $2, 'First image')`,
          [prodId, path],
        );

        const failure = await captureSqlError(client, () =>
          client.query(
            `insert into public.product_images (product_id, storage_path, alt_text)
             values ($1, $2, 'Duplicate path image')`,
            [prodId, path],
          ),
        );

        expect(failure.code).toBe('23505');
        expect(failure.message).toContain('product_images_path_unique');
      });
    });

    it('enforces product_images_one_primary for active images per product', async () => {
      await withRolledBackClient(async (client) => {
        const catId = await seedCategory(client, 'one-primary');
        const prodId = await seedProduct(client, catId);

        await client.query(
          `insert into public.product_images (product_id, storage_path, alt_text, is_primary, display_order)
           values ($1, 'p1.webp', 'Primary 1', true, 0)`,
          [prodId],
        );

        const failure = await captureSqlError(client, () =>
          client.query(
            `insert into public.product_images (product_id, storage_path, alt_text, is_primary, display_order)
             values ($1, 'p2.webp', 'Primary 2', true, 1)`,
            [prodId],
          ),
        );

        expect(failure.code).toBe('23505');
        expect(failure.message).toContain('product_images_one_primary');
      });
    });

    it('allows a soft-deleted image to have is_primary = true alongside an active primary', async () => {
      await withRolledBackClient(async (client) => {
        const catId = await seedCategory(client, 'soft-delete-primary');
        const prodId = await seedProduct(client, catId);

        await client.query(
          `insert into public.product_images (product_id, storage_path, alt_text, is_primary, display_order, deleted_at)
           values ($1, 'deleted-p1.webp', 'Deleted Primary', true, 0, now())`,
          [prodId],
        );

        // An active image can be primary since the previous one is deleted
        const active = await client.query<{ id: string }>(
          `insert into public.product_images (product_id, storage_path, alt_text, is_primary, display_order)
           values ($1, 'active-p2.webp', 'Active Primary', true, 0)
           returning id::text`,
          [prodId],
        );

        expect(active.rows).toHaveLength(1);
      });
    });

    it('enforces product_images_ordered for non-deleted images per product', async () => {
      await withRolledBackClient(async (client) => {
        const catId = await seedCategory(client, 'ordered');
        const prodId = await seedProduct(client, catId);

        await client.query(
          `insert into public.product_images (product_id, storage_path, alt_text, display_order)
           values ($1, 'ord1.webp', 'Order 0', 0)`,
          [prodId],
        );

        const failure = await captureSqlError(client, () =>
          client.query(
            `insert into public.product_images (product_id, storage_path, alt_text, display_order)
             values ($1, 'ord2.webp', 'Duplicate Order 0', 0)`,
            [prodId],
          ),
        );

        expect(failure.code).toBe('23505');
        expect(failure.message).toContain('product_images_ordered');
      });
    });
  });

  describe('public views and licensing gate (security_invoker = true)', () => {
    it('is declared WITH (security_invoker = true)', async () => {
      const result = await pool.query<{ relname: string; reloptions: string[] | null }>(
        `select c.relname::text, c.reloptions
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname in ('product_images_public', 'products_public', 'category_images_public')
          order by c.relname`,
      );

      expect(result.rows).toHaveLength(3);
      for (const row of result.rows) {
        expect(row.reloptions).toContain('security_invoker=true');
      }
    });

    it('hides pending images from product_images_public and shows own/approved/not-required', async () => {
      await withRolledBackClient(async (client) => {
        const catId = await seedCategory(client, 'licence-gate');
        const prodId = await seedProduct(client, catId);

        // Seed 4 images with different permission statuses
        await client.query(
          `insert into public.product_images (product_id, storage_path, alt_text, permission_status, display_order)
           values
             ($1, 'pending.webp', 'Pending Image', 'pending', 0),
             ($1, 'own.webp', 'Own Image', 'own', 1),
             ($1, 'approved.webp', 'Approved Image', 'approved', 2),
             ($1, 'not-req.webp', 'Not Required Image', 'not-required', 3)`,
          [prodId],
        );

        const publicRows = await client.query<{ storage_path: string; permission_status: string }>(
          `select storage_path::text, permission_status::text
             from public.product_images_public
            where product_id = $1
            order by display_order`,
          [prodId],
        );

        expect(publicRows.rows.map((r) => r.storage_path)).toEqual([
          'own.webp',
          'approved.webp',
          'not-req.webp',
        ]);
      });
    });

    it('hides soft-deleted images from product_images_public even if approved', async () => {
      await withRolledBackClient(async (client) => {
        const catId = await seedCategory(client, 'soft-delete-view');
        const prodId = await seedProduct(client, catId);

        await client.query(
          `insert into public.product_images (product_id, storage_path, alt_text, permission_status, deleted_at)
           values ($1, 'deleted-approved.webp', 'Deleted Approved Image', 'approved', now())`,
          [prodId],
        );

        const publicRows = await client.query<{ id: string }>(
          `select id from public.product_images_public where product_id = $1`,
          [prodId],
        );

        expect(publicRows.rows).toEqual([]);
      });
    });

    it('hides inactive products from products_public', async () => {
      await withRolledBackClient(async (client) => {
        const catId = await seedCategory(client, 'active-filter');
        const activeProd = await seedProduct(client, catId, { isActive: true });
        const inactiveProd = await seedProduct(client, catId, { isActive: false });

        const activeRows = await client.query<{ id: string }>(
          `select id::text from public.products_public where id in ($1, $2)`,
          [activeProd, inactiveProd],
        );

        expect(activeRows.rows).toEqual([{ id: activeProd }]);
      });
    });

    it('allows anon to read product_images_public and products_public through security_invoker', async () => {
      await withRolledBackClient(async (client) => {
        const catId = await seedCategory(client, 'anon-invoker');
        const prodId = await seedProduct(client, catId, { isActive: true });

        await client.query(
          `insert into public.product_images (product_id, storage_path, alt_text, permission_status, display_order)
           values
             ($1, 'anon-pending.webp', 'Anon Pending', 'pending', 0),
             ($1, 'anon-own.webp', 'Anon Own', 'own', 1)`,
          [prodId],
        );

        await client.query('set local role anon');

        const prods = await client.query<{ id: string }>(
          `select id::text from public.products_public where id = $1`,
          [prodId],
        );
        expect(prods.rows).toEqual([{ id: prodId }]);

        const images = await client.query<{ storage_path: string }>(
          `select storage_path::text from public.product_images_public where product_id = $1`,
          [prodId],
        );
        expect(images.rows).toEqual([{ storage_path: 'anon-own.webp' }]);
      });
    });
  });

  describe('attach_product_image function', () => {
    it('sets first image as primary and display_order 0, subsequent as not primary', async () => {
      await withRolledBackClient(async (client) => {
        const catId = await seedCategory(client, 'attach-order');
        const prodId = await seedProduct(client, catId);

        const img1 = await client.query<{ display_order: number; is_primary: boolean; permission_status: string }>(
          `select display_order, is_primary, permission_status::text
             from public.attach_product_image(
               $1, 'img1.webp', 'First image alt text', 'main', 1200, 800, 150000,
               'image/webp', 'blurhash1', 'own', null, 'license1'
             )`,
          [prodId],
        );

        expect(img1.rows[0]).toEqual({
          display_order: 0,
          is_primary: true,
          permission_status: 'pending',
        });

        const img2 = await client.query<{ display_order: number; is_primary: boolean; permission_status: string }>(
          `select display_order, is_primary, permission_status::text
             from public.attach_product_image(
               $1, 'img2.webp', 'Second image alt text', 'detail', 1200, 800, 120000,
               'image/webp', 'blurhash2', 'own', null, 'license1'
             )`,
          [prodId],
        );

        expect(img2.rows[0]).toEqual({
          display_order: 1,
          is_primary: false,
          permission_status: 'pending',
        });
      });
    });

    it('serializes two concurrent attaches on the same product without duplicate display_order', async () => {
      let catId: string | undefined;
      let prodId: string | undefined;

      const setupClient = await pool.connect();
      try {
        await setupClient.query('begin');
        catId = await seedCategory(setupClient, 'race');
        prodId = await seedProduct(setupClient, catId);
        await setupClient.query('commit');
      } finally {
        setupClient.release();
      }

      try {
        const clientA = await pool.connect();
        const clientB = await pool.connect();

        try {
          const attachA = clientA.query<{ display_order: number }>(
            `select display_order from public.attach_product_image(
               $1, 'race-a.webp', 'Race A alt text', 'detail', 800, 600, 10000,
               'image/webp', 'hashA', 'own', null, 'lic'
             )`,
            [prodId],
          );

          const attachB = clientB.query<{ display_order: number }>(
            `select display_order from public.attach_product_image(
               $1, 'race-b.webp', 'Race B alt text', 'detail', 800, 600, 10000,
               'image/webp', 'hashB', 'own', null, 'lic'
             )`,
            [prodId],
          );

          const [resA, resB] = await Promise.all([attachA, attachB]);

          const orders = [resA.rows[0]!.display_order, resB.rows[0]!.display_order].sort();
          expect(orders).toEqual([0, 1]);
        } finally {
          clientA.release();
          clientB.release();
        }
      } finally {
        if (prodId !== undefined && catId !== undefined) {
          const cleanupClient = await pool.connect();
          try {
            await cleanupClient.query('delete from public.products where id = $1', [prodId]);
            await cleanupClient.query('delete from public.categories where id = $1', [catId]);
          } finally {
            cleanupClient.release();
          }
        }
      }
    });

    it('refuses to attach image to non-existent product', async () => {
      await withRolledBackClient(async (client) => {
        const missingProdId = randomUUID();

        const failure = await captureSqlError(client, () =>
          client.query(
            `select public.attach_product_image(
               $1, 'missing.webp', 'Missing prod alt', 'main', 800, 600, 1000,
               'image/webp', 'hash', 'own', null, 'lic'
             )`,
            [missingProdId],
          ),
        );

        expect(failure.message).toContain(`Product ${missingProdId} does not exist`);
      });
    });
  });

  describe('set_primary_product_image and remove_product_image functions', () => {
    it('set_primary_product_image leaves exactly one primary image', async () => {
      await withRolledBackClient(async (client) => {
        const catId = await seedCategory(client, 'set-primary');
        const prodId = await seedProduct(client, catId);

        const img1 = (await client.query<{ id: string }>(
          `select id from public.attach_product_image(
             $1, 'img1.webp', 'Alt text 1', 'main', 800, 600, 1000,
             'image/webp', 'hash1', 'own', null, 'lic'
           )`,
          [prodId],
        )).rows[0]!.id;

        const img2 = (await client.query<{ id: string }>(
          `select id from public.attach_product_image(
             $1, 'img2.webp', 'Alt text 2', 'detail', 800, 600, 1000,
             'image/webp', 'hash2', 'own', null, 'lic'
           )`,
          [prodId],
        )).rows[0]!.id;

        // img1 was initially primary. Set img2 as primary.
        await client.query('select public.set_primary_product_image($1)', [img2]);

        const primaries = await client.query<{ id: string; is_primary: boolean }>(
          `select id::text, is_primary
             from public.product_images
            where product_id = $1
            order by display_order`,
          [prodId],
        );

        expect(primaries.rows).toEqual([
          { id: img1, is_primary: false },
          { id: img2, is_primary: true },
        ]);
      });
    });

    it('remove_product_image soft deletes and promotes next primary', async () => {
      await withRolledBackClient(async (client) => {
        const catId = await seedCategory(client, 'remove-primary');
        const prodId = await seedProduct(client, catId);

        const img1 = (await client.query<{ id: string }>(
          `select id from public.attach_product_image(
             $1, 'img1.webp', 'Alt 1', 'main', 800, 600, 1000,
             'image/webp', 'hash1', 'own', null, 'lic'
           )`,
          [prodId],
        )).rows[0]!.id;

        const img2 = (await client.query<{ id: string }>(
          `select id from public.attach_product_image(
             $1, 'img2.webp', 'Alt 2', 'detail', 800, 600, 1000,
             'image/webp', 'hash2', 'own', null, 'lic'
           )`,
          [prodId],
        )).rows[0]!.id;

        // img1 is primary. Remove img1.
        await client.query('select public.remove_product_image($1)', [img1]);

        const status = await client.query<{ id: string; is_primary: boolean; deleted_at: string | null }>(
          `select id::text, is_primary, deleted_at::text
             from public.product_images
            where product_id = $1
            order by display_order`,
          [prodId],
        );

        expect(status.rows[0]?.id).toBe(img1);
        expect(status.rows[0]?.is_primary).toBe(false);
        expect(status.rows[0]?.deleted_at).not.toBeNull();

        expect(status.rows[1]?.id).toBe(img2);
        expect(status.rows[1]?.is_primary).toBe(true);
        expect(status.rows[1]?.deleted_at).toBeNull();
      });
    });

    it('remove_product_image on the last remaining image leaves zero primaries', async () => {
      await withRolledBackClient(async (client) => {
        const catId = await seedCategory(client, 'remove-last');
        const prodId = await seedProduct(client, catId);

        const img1 = (await client.query<{ id: string }>(
          `select id from public.attach_product_image(
             $1, 'img1.webp', 'Alt 1', 'main', 800, 600, 1000,
             'image/webp', 'hash1', 'own', null, 'lic'
           )`,
          [prodId],
        )).rows[0]!.id;

        await client.query('select public.remove_product_image($1)', [img1]);

        const primaries = await client.query<{ count: string }>(
          `select count(*)::text as count
             from public.product_images
            where product_id = $1
              and is_primary = true
              and deleted_at is null`,
          [prodId],
        );

        expect(primaries.rows[0]?.count).toBe('0');
      });
    });
  });

  describe('stored procedures security and privileges', () => {
    it('refuses execution of attach_product_image to anon with 42501', async () => {
      await withRolledBackClient(async (client) => {
        await client.query('set local role anon');

        const failure = await captureSqlError(client, () =>
          client.query(
            `select public.attach_product_image(
               $1, 'a.webp', 'alt', 'main', 800, 600, 1000,
               'image/webp', 'h', 'own', null, 'l'
             )`,
            [randomUUID()],
          ),
        );

        expect(failure.code).toBe('42501');
        expect(failure.message).toContain('permission denied for function attach_product_image');
      });
    });

    it('refuses execution of set_primary_product_image to anon with 42501', async () => {
      await withRolledBackClient(async (client) => {
        await client.query('set local role anon');

        const failure = await captureSqlError(client, () =>
          client.query('select public.set_primary_product_image($1)', [randomUUID()]),
        );

        expect(failure.code).toBe('42501');
        expect(failure.message).toContain('permission denied for function set_primary_product_image');
      });
    });

    it('refuses execution of remove_product_image to anon with 42501', async () => {
      await withRolledBackClient(async (client) => {
        await client.query('set local role anon');

        const failure = await captureSqlError(client, () =>
          client.query('select public.remove_product_image($1)', [randomUUID()]),
        );

        expect(failure.code).toBe('42501');
        expect(failure.message).toContain('permission denied for function remove_product_image');
      });
    });
  });
});

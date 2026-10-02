import { randomUUID } from 'node:crypto';

import type { DatabaseError, PoolClient } from 'pg';

import { describeWithStack, pool } from '../support/stack.ts';

interface SqlFailure {
  code: string | undefined;
  message: string;
}

interface CreateOrderResult {
  id: string;
  order_number: string;
  subtotal: string | number;
  delivery_fee: string | number;
  total: string | number;
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
    `insert into public.categories (name, slug)
     values ($1, $2)
     returning id::text`,
    [`Phase 6 Category ${label}`, `phase6-cat-${label}-${randomUUID()}`],
  );
  return result.rows[0]!.id;
}

async function seedProduct(
  client: PoolClient,
  options?: {
    basePrice?: number;
    minOrderQuantity?: number;
    isActive?: boolean;
    productType?: 'standard' | 'dimensioned';
  },
): Promise<string> {
  const categoryId = await seedCategory(client, 'prod');
  const basePrice = options?.basePrice ?? 50000;
  const minOrderQuantity = options?.minOrderQuantity ?? 1;
  const isActive = options?.isActive ?? true;
  const productType = options?.productType ?? 'standard';

  const result = await client.query<{ id: string }>(
    `insert into public.products
       (category_id, name, slug, description, base_price, min_order_quantity, is_active, product_type)
     values ($1, 'Phase 6 Product', $2, 'Description', $3, $4, $5, $6::product_type)
     returning id::text`,
    [
      categoryId,
      `phase6-prod-${randomUUID()}`,
      basePrice,
      minOrderQuantity,
      isActive,
      productType,
    ],
  );
  return result.rows[0]!.id;
}

async function seedVariant(
  client: PoolClient,
  productId: string,
  options?: {
    priceOverride?: number | null;
    stockQuantity?: number;
    isActive?: boolean;
  },
): Promise<string> {
  const priceOverride = options?.priceOverride ?? null;
  const stockQuantity = options?.stockQuantity ?? 10;
  const isActive = options?.isActive ?? true;

  const result = await client.query<{ id: string }>(
    `insert into public.product_variants
       (product_id, name, sku, price_override, stock_quantity, is_active)
     values ($1, 'Phase 6 Variant', $2, $3, $4, $5)
     returning id::text`,
    [
      productId,
      `phase6-sku-${randomUUID()}`,
      priceOverride,
      stockQuantity,
      isActive,
    ],
  );
  return result.rows[0]!.id;
}

function sampleCustomer(overrides?: Record<string, unknown>) {
  return {
    fullName: 'Jane Customer',
    email: `customer-${randomUUID()}@example.invalid`,
    phone: '08012345678',
    streetAddress: '12 Commercial Avenue',
    city: 'Yaba',
    state: 'Lagos',
    additionalInstructions: 'Leave with security',
    paymentMethod: 'bank_transfer',
    ...overrides,
  };
}

describeWithStack('phase 6 order numbers and create_order', () => {
  describe('order_number_seq and default sequence', () => {
    it('defines public.order_number_seq', async () => {
      const result = await pool.query<{ relname: string }>(
        `select c.relname::text
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relkind = 'S'
            and c.relname = 'order_number_seq'`,
      );

      expect(result.rows).toEqual([{ relname: 'order_number_seq' }]);
    });

    it('generates unique sequential order numbers without collision', async () => {
      await withRolledBackClient(async (client) => {
        const productId = await seedProduct(client, { basePrice: 10000 });
        const variantId = await seedVariant(client, productId, { stockQuantity: 200 });

        const numbers = new Set<string>();
        for (let i = 0; i < 20; i++) {
          const result = await client.query<{ create_order: CreateOrderResult }>(
            `select public.create_order(null, $1::jsonb, $2::jsonb) as create_order`,
            [
              JSON.stringify(sampleCustomer()),
              JSON.stringify([{ productId, variantId, quantity: 1 }]),
            ],
          );
          const orderNumber = result.rows[0]!.create_order.order_number;
          expect(orderNumber).toMatch(/^RC-/);
          expect(numbers.has(orderNumber)).toBe(false);
          numbers.add(orderNumber);
        }
        expect(numbers.size).toBe(20);
      });
    });
  });

  describe('create_order atomic pricing and calculations', () => {
    it('applies delivery fee = 15000 when subtotal <= 500000', async () => {
      await withRolledBackClient(async (client) => {
        const productId = await seedProduct(client, { basePrice: 200000 });
        const variantId = await seedVariant(client, productId, { stockQuantity: 5 });

        const result = await client.query<{ create_order: CreateOrderResult }>(
          `select public.create_order(null, $1::jsonb, $2::jsonb) as create_order`,
          [
            JSON.stringify(sampleCustomer()),
            JSON.stringify([{ productId, variantId, quantity: 2 }]), // 400,000 subtotal
          ],
        );

        const order = result.rows[0]!.create_order;
        expect(Number(order.subtotal)).toBe(400000);
        expect(Number(order.delivery_fee)).toBe(15000);
        expect(Number(order.total)).toBe(415000);
      });
    });

    it('applies delivery fee = 0 when subtotal > 500000', async () => {
      await withRolledBackClient(async (client) => {
        const productId = await seedProduct(client, { basePrice: 300000 });
        const variantId = await seedVariant(client, productId, { stockQuantity: 5 });

        const result = await client.query<{ create_order: CreateOrderResult }>(
          `select public.create_order(null, $1::jsonb, $2::jsonb) as create_order`,
          [
            JSON.stringify(sampleCustomer()),
            JSON.stringify([{ productId, variantId, quantity: 2 }]), // 600,000 subtotal
          ],
        );

        const order = result.rows[0]!.create_order;
        expect(Number(order.subtotal)).toBe(600000);
        expect(Number(order.delivery_fee)).toBe(0);
        expect(Number(order.total)).toBe(600000);
      });
    });

    it('prefers variant.price_override over product.base_price', async () => {
      await withRolledBackClient(async (client) => {
        const productId = await seedProduct(client, { basePrice: 50000 });
        const variantId = await seedVariant(client, productId, {
          priceOverride: 75000,
          stockQuantity: 10,
        });

        const result = await client.query<{ create_order: CreateOrderResult }>(
          `select public.create_order(null, $1::jsonb, $2::jsonb) as create_order`,
          [
            JSON.stringify(sampleCustomer()),
            JSON.stringify([{ productId, variantId, quantity: 2 }]),
          ],
        );

        const order = result.rows[0]!.create_order;
        expect(Number(order.subtotal)).toBe(150000); // 75000 * 2
      });
    });

    it('computes line total for dimensioned product: price * length_metres * quantity', async () => {
      await withRolledBackClient(async (client) => {
        const productId = await seedProduct(client, {
          basePrice: 5000,
          productType: 'dimensioned',
        });
        const variantId = await seedVariant(client, productId, { stockQuantity: 10 });

        const result = await client.query<{ create_order: CreateOrderResult }>(
          `select public.create_order(null, $1::jsonb, $2::jsonb) as create_order`,
          [
            JSON.stringify(sampleCustomer()),
            JSON.stringify([
              {
                productId,
                variantId,
                quantity: 4,
                customSpecs: { length_metres: 3.5 },
              },
            ]),
          ],
        );

        const order = result.rows[0]!.create_order;
        // 5000 * 3.5 * 4 = 70000
        expect(Number(order.subtotal)).toBe(70000);
      });
    });

    it('ignores client-injected money fields in customer or item bodies', async () => {
      await withRolledBackClient(async (client) => {
        const productId = await seedProduct(client, { basePrice: 100000 });
        const variantId = await seedVariant(client, productId, { stockQuantity: 5 });

        const forgedCustomer = sampleCustomer({
          subtotal: 100,
          deliveryFee: 0,
          total: 100,
          unitPrice: 1,
        });

        const forgedItems = [
          {
            productId,
            variantId,
            quantity: 1,
            unitPrice: 10,
            subtotal: 10,
            total: 10,
          },
        ];

        const result = await client.query<{ create_order: CreateOrderResult }>(
          `select public.create_order(null, $1::jsonb, $2::jsonb) as create_order`,
          [JSON.stringify(forgedCustomer), JSON.stringify(forgedItems)],
        );

        const order = result.rows[0]!.create_order;
        expect(Number(order.subtotal)).toBe(100000);
        expect(Number(order.delivery_fee)).toBe(15000);
        expect(Number(order.total)).toBe(115000);
      });
    });
  });

  describe('create_order validations and rollbacks', () => {
    it('rejects when quantity < min_order_quantity', async () => {
      await withRolledBackClient(async (client) => {
        const productId = await seedProduct(client, {
          basePrice: 10000,
          minOrderQuantity: 5,
        });
        const variantId = await seedVariant(client, productId, { stockQuantity: 20 });

        const failure = await captureSqlError(client, () =>
          client.query(
            `select public.create_order(null, $1::jsonb, $2::jsonb)`,
            [
              JSON.stringify(sampleCustomer()),
              JSON.stringify([{ productId, variantId, quantity: 3 }]),
            ],
          ),
        );

        expect(failure.message).toMatch(/min_order_quantity|Quantity less than minimum/i);
      });
    });

    it('rejects when product is inactive', async () => {
      await withRolledBackClient(async (client) => {
        const productId = await seedProduct(client, { isActive: false });
        const variantId = await seedVariant(client, productId, { stockQuantity: 10 });

        const failure = await captureSqlError(client, () =>
          client.query(
            `select public.create_order(null, $1::jsonb, $2::jsonb)`,
            [
              JSON.stringify(sampleCustomer()),
              JSON.stringify([{ productId, variantId, quantity: 1 }]),
            ],
          ),
        );

        expect(failure.message).toMatch(/inactive|not found|not available/i);
      });
    });

    it('rejects when variant is inactive', async () => {
      await withRolledBackClient(async (client) => {
        const productId = await seedProduct(client, { isActive: true });
        const variantId = await seedVariant(client, productId, {
          isActive: false,
          stockQuantity: 10,
        });

        const failure = await captureSqlError(client, () =>
          client.query(
            `select public.create_order(null, $1::jsonb, $2::jsonb)`,
            [
              JSON.stringify(sampleCustomer()),
              JSON.stringify([{ productId, variantId, quantity: 1 }]),
            ],
          ),
        );

        expect(failure.message).toMatch(/inactive|not found|not available/i);
      });
    });

    it('rejects when variant does not belong to the product', async () => {
      await withRolledBackClient(async (client) => {
        const product1 = await seedProduct(client);
        const product2 = await seedProduct(client);
        const variantOfProduct2 = await seedVariant(client, product2, {
          stockQuantity: 10,
        });

        const failure = await captureSqlError(client, () =>
          client.query(
            `select public.create_order(null, $1::jsonb, $2::jsonb)`,
            [
              JSON.stringify(sampleCustomer()),
              JSON.stringify([{ productId: product1, variantId: variantOfProduct2, quantity: 1 }]),
            ],
          ),
        );

        expect(failure.message).toMatch(/variant does not belong to product|mismatch/i);
      });
    });

    it('leaves nothing behind on mid-checkout failure', async () => {
      await withRolledBackClient(async (client) => {
        const validProductId = await seedProduct(client, { basePrice: 50000 });
        const validVariantId = await seedVariant(client, validProductId, { stockQuantity: 10 });
        const nonExistentProductId = randomUUID();

        const ordersBefore = await client.query(`select count(*)::int as cnt from public.orders`);
        const itemsBefore = await client.query(`select count(*)::int as cnt from public.order_items`);
        const stockBefore = await client.query<{ stock_quantity: number }>(
          `select stock_quantity from public.product_variants where id = $1`,
          [validVariantId],
        );

        await captureSqlError(client, () =>
          client.query(
            `select public.create_order(null, $1::jsonb, $2::jsonb)`,
            [
              JSON.stringify(sampleCustomer()),
              JSON.stringify([
                { productId: validProductId, variantId: validVariantId, quantity: 2 },
                { productId: nonExistentProductId, quantity: 1 },
              ]),
            ],
          ),
        );

        const ordersAfter = await client.query(`select count(*)::int as cnt from public.orders`);
        const itemsAfter = await client.query(`select count(*)::int as cnt from public.order_items`);
        const stockAfter = await client.query<{ stock_quantity: number }>(
          `select stock_quantity from public.product_variants where id = $1`,
          [validVariantId],
        );

        expect(ordersAfter.rows[0]!.cnt).toBe(ordersBefore.rows[0]!.cnt);
        expect(itemsAfter.rows[0]!.cnt).toBe(itemsBefore.rows[0]!.cnt);
        expect(stockAfter.rows[0]!.stock_quantity).toBe(stockBefore.rows[0]!.stock_quantity);
      });
    });
  });

  describe('email outbox and side-effects', () => {
    it('creates an order-confirmation row in email_outbox in the same transaction', async () => {
      await withRolledBackClient(async (client) => {
        const productId = await seedProduct(client, { basePrice: 100000 });
        const variantId = await seedVariant(client, productId, { stockQuantity: 5 });
        const customer = sampleCustomer({ email: 'checkout-email@example.invalid' });

        const result = await client.query<{ create_order: CreateOrderResult }>(
          `select public.create_order(null, $1::jsonb, $2::jsonb) as create_order`,
          [JSON.stringify(customer), JSON.stringify([{ productId, variantId, quantity: 1 }])],
        );

        const orderId = result.rows[0]!.create_order.id;
        const outbox = await client.query<{
          template: string;
          to_email: string;
          order_id: string;
          sent_at: string | null;
        }>(
          `select template, to_email, order_id::text, sent_at
             from public.email_outbox
            where order_id = $1`,
          [orderId],
        );

        expect(outbox.rows).toHaveLength(1);
        expect(outbox.rows[0]!.template).toBe('order-confirmation');
        expect(outbox.rows[0]!.to_email).toBe('checkout-email@example.invalid');
        expect(outbox.rows[0]!.sent_at).toBeNull();
      });
    });
  });

  describe('concurrency row locking', () => {
    it('two concurrent checkouts for the last unit cannot both succeed', async () => {
      // Create a persistent variant with 1 unit in a dedicated transaction
      let productId = '';
      let variantId = '';

      const setupClient = await pool.connect();
      try {
        const catRes = await setupClient.query<{ id: string }>(
          `insert into public.categories (name, slug) values ('Race Cat', $1) returning id::text`,
          [`race-cat-${randomUUID()}`],
        );
        const prodRes = await setupClient.query<{ id: string }>(
          `insert into public.products (category_id, name, slug, description, base_price)
           values ($1, 'Race Prod', $2, 'Desc', 50000) returning id::text`,
          [catRes.rows[0]!.id, `race-prod-${randomUUID()}`],
        );
        const varRes = await setupClient.query<{ id: string }>(
          `insert into public.product_variants (product_id, name, sku, stock_quantity)
           values ($1, 'Race Var', $2, 1) returning id::text`,
          [prodRes.rows[0]!.id, `race-sku-${randomUUID()}`],
        );
        productId = prodRes.rows[0]!.id;
        variantId = varRes.rows[0]!.id;
      } finally {
        setupClient.release();
      }

      // Launch two racing clients executing create_order for quantity 1
      const client1 = await pool.connect();
      const client2 = await pool.connect();

      try {
        const callOrder = (client: PoolClient) =>
          client.query<{ create_order: CreateOrderResult }>(
            `select public.create_order(null, $1::jsonb, $2::jsonb) as create_order`,
            [
              JSON.stringify(sampleCustomer()),
              JSON.stringify([{ productId, variantId, quantity: 1 }]),
            ],
          );

        const results = await Promise.allSettled([callOrder(client1), callOrder(client2)]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');

        // Exactly one checkout must succeed and one must fail
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        // Verify remaining stock is exactly 0, not negative
        const stockRes = await pool.query<{ stock_quantity: number }>(
          `select stock_quantity from public.product_variants where id = $1`,
          [variantId],
        );
        expect(stockRes.rows[0]!.stock_quantity).toBe(0);
      } finally {
        client1.release();
        client2.release();

        // Cleanup the test data
        const cleanupClient = await pool.connect();
        try {
          await cleanupClient.query(`delete from public.products where id = $1`, [productId]);
        } catch {
          // ignore
        } finally {
          cleanupClient.release();
        }
      }
    });
  });
});

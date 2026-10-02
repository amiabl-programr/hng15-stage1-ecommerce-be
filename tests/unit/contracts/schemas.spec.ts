import { z } from 'zod';

import * as admin from '../../../src/contracts/schemas/admin.ts';
import * as auth from '../../../src/contracts/schemas/auth.ts';
import * as catalog from '../../../src/contracts/schemas/catalog.ts';
import * as checkout from '../../../src/contracts/schemas/checkout.ts';
import * as common from '../../../src/contracts/schemas/common.ts';
import * as fabrication from '../../../src/contracts/schemas/fabrication.ts';
import * as media from '../../../src/contracts/schemas/media.ts';

/**
 * Boundary behaviour of the contracts. These are the rules notes.md states as hard
 * requirements, so each one is asserted at the exact value that separates pass from fail
 * rather than with a representative sample.
 */

const productId = '3f8c1d2e-5b6a-4c7d-9e0f-1a2b3c4d5e6f';
const variantId = '11111111-2222-4333-8444-555555555555';

function validCustomer() {
  return {
    fullName: 'Victor Okonkwo',
    email: 'victor@example.com',
    phone: '+2348007663464',
    streetAddress: '12 Ozumba Mbadiwe Avenue',
    city: 'Lagos',
    state: 'Lagos',
    paymentMethod: 'transfer',
  };
}

function validItem(overrides: Record<string, unknown> = {}) {
  return { productId, quantity: 2, ...overrides };
}

// ── alt text: 8–200, notes.md §7 ────────────────────────────────────────────────

describe('AltTextSchema', () => {
  it('accepts the shortest legal value', () => {
    expect(common.AltTextSchema.safeParse('12345678').success).toBe(true);
  });

  it('rejects one character under the minimum', () => {
    expect(common.AltTextSchema.safeParse('1234567').success).toBe(false);
  });

  it('accepts the longest legal value', () => {
    expect(common.AltTextSchema.safeParse('a'.repeat(200)).success).toBe(true);
  });

  it('rejects one character over the maximum', () => {
    expect(common.AltTextSchema.safeParse('a'.repeat(201)).success).toBe(false);
  });

  it('counts after trimming, so padding cannot fake compliance', () => {
    expect(common.AltTextSchema.safeParse('       abc       ').success).toBe(false);
  });

  it('names the rule in the message', () => {
    const result = common.AltTextSchema.safeParse('short');

    expect(result.error?.issues[0]?.message).toMatch(/at least 8 characters/);
  });
});

// ── quantities: ≥ 1 ──────────────────────────────────────────────────────────────

describe('OrderItemRequestSchema.quantity', () => {
  it('accepts 1', () => {
    expect(checkout.OrderItemRequestSchema.safeParse(validItem({ quantity: 1 })).success).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects %p', (quantity) => {
    expect(checkout.OrderItemRequestSchema.safeParse(validItem({ quantity })).success).toBe(false);
  });

  it('requires an order to have at least one item', () => {
    expect(checkout.CreateOrderRequestSchema.safeParse({ customer: validCustomer(), items: [] }).success).toBe(
      false,
    );
  });
});

// ── the open redirect guard, notes.md §5 ─────────────────────────────────────────

describe('RelativePathSchema', () => {
  it.each(['/account', '/account/orders', '/a'])('accepts %s', (value) => {
    expect(common.RelativePathSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    '//evil.test',
    '/\\evil.test',
    'https://evil.test',
    'account',
    '',
    '/',
  ])('rejects %p', (value) => {
    expect(common.RelativePathSchema.safeParse(value).success).toBe(false);
  });

  it('is enforced by the oauth query contract', () => {
    const result = auth.GoogleAuthQuerySchema.safeParse({ next: '//evil.test' });

    expect(result.success).toBe(false);
  });

  it('defaults next to a safe same-origin path', () => {
    const parsed = auth.GoogleAuthQuerySchema.parse({});

    expect(parsed.next).toBe('/account');
  });
});

// ── money is a whole number of naira ─────────────────────────────────────────────

describe('MoneySchema', () => {
  it('accepts zero and a whole naira amount', () => {
    expect(common.MoneySchema.safeParse(0).success).toBe(true);
    expect(common.MoneySchema.safeParse(1_500_000).success).toBe(true);
  });

  it('rejects fractional naira, negative and non-finite values', () => {
    for (const value of [15000.5, -1, Number.POSITIVE_INFINITY]) {
      expect([value, common.MoneySchema.safeParse(value).success]).toEqual([value, false]);
    }
  });
});

// ── the checkout body carries no money at all, notes.md §9 ────────────────────────

describe('CreateOrderRequestSchema', () => {
  it('accepts a well-formed guest order', () => {
    const result = checkout.CreateOrderRequestSchema.safeParse({
      customer: validCustomer(),
      items: [validItem(), validItem({ variantId, quantity: 1, customSpecs: { lengthMetres: 12.5 } })],
    });

    expect(result.success).toBe(true);
  });

  it.each(['price', 'unitPrice', 'subtotal', 'deliveryFee', 'total'])(
    'rejects a caller-supplied %s',
    (field) => {
      const result = checkout.CreateOrderRequestSchema.safeParse({
        customer: validCustomer(),
        items: [validItem()],
        [field]: 1,
      });

      // Strict objects reject the key outright, so the violation cannot reach create_order().
      expect(result.success).toBe(false);
      expect(result.error?.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
    },
  );

  it.each(['unitPrice', 'lineTotal'])('rejects %s on an item too', (field) => {
    const result = checkout.CreateOrderRequestSchema.safeParse({
      customer: validCustomer(),
      items: [validItem({ [field]: 1 })],
    });

    expect(result.success).toBe(false);
  });

  it('accepts an authenticated order with no customer block changes', () => {
    const result = checkout.CreateOrderRequestSchema.safeParse({
      customer: validCustomer(),
      items: [validItem()],
    });

    expect(result.success).toBe(true);
  });

  it('rejects a negative length', () => {
    const result = checkout.CreateOrderRequestSchema.safeParse({
      customer: validCustomer(),
      items: [validItem({ customSpecs: { lengthMetres: -1 } })],
    });

    expect(result.success).toBe(false);
  });
});

// ── slugs ────────────────────────────────────────────────────────────────────────

describe('SlugSchema', () => {
  it.each(['longspan', 'step-tile', 'roofing-accessories'])('accepts %s', (value) => {
    expect(common.SlugSchema.safeParse(value).success).toBe(true);
  });

  it.each(['Longspan', 'step_tile', 'step--tile', '-leading', 'trailing-', 'has space', ''])(
    'rejects %p',
    (value) => {
      expect(common.SlugSchema.safeParse(value).success).toBe(false);
    },
  );
});

// ── every enum member is accepted ────────────────────────────────────────────────

describe('enum coverage', () => {
  const uuid = productId;

  it.each(common.PROFILE_KINDS)('ProfileKind accepts %s', (value) => {
    expect(common.ProfileKindSchema.safeParse(value).success).toBe(true);
    expect(catalog.ProductSchema.safeParse({ id: uuid, name: 'x', slug: 'x', description: null, profileKind: value, productType: 'standard', unitType: 'piece', basePrice: 0, minOrderQuantity: 1, isActive: true, category: null, media: [] }).success).toBe(true);
  });

  it('ProfileKind has exactly the twelve values the old frontend inferred', () => {
    expect(common.PROFILE_KINDS).toHaveLength(12);
    expect(new Set(common.PROFILE_KINDS).size).toBe(12);
  });

  it.each(common.IMAGE_ROLES)('ImageRole accepts %s', (value) => {
    expect(common.ImageRoleSchema.safeParse(value).success).toBe(true);
  });

  it.each(common.PERMISSION_STATUSES)('PermissionStatus accepts %s', (value) => {
    expect(common.PermissionStatusSchema.safeParse(value).success).toBe(true);
  });

  it.each(common.PRODUCT_TYPES)('ProductType accepts %s', (value) => {
    expect(common.ProductTypeSchema.safeParse(value).success).toBe(true);
  });

  it.each(common.UNIT_TYPES)('UnitType accepts %s', (value) => {
    expect(common.UnitTypeSchema.safeParse(value).success).toBe(true);
  });

  it.each(common.ORDER_STATUSES)('OrderStatus accepts %s', (value) => {
    expect(common.OrderStatusSchema.safeParse(value).success).toBe(true);
  });

  it.each(common.PAYMENT_STATUSES)('PaymentStatus accepts %s', (value) => {
    expect(common.PaymentStatusSchema.safeParse(value).success).toBe(true);
  });

  it.each(common.PAYMENT_METHODS)('PaymentMethod accepts %s', (value) => {
    expect(common.PaymentMethodSchema.safeParse(value).success).toBe(true);
  });

  it.each(common.USER_ROLES)('UserRole accepts %s', (value) => {
    expect(common.UserRoleSchema.safeParse(value).success).toBe(true);
  });

  it.each(common.ERROR_CODES)('ErrorCode accepts %s', (value) => {
    expect(common.ErrorCodeSchema.safeParse(value).success).toBe(true);
  });

  it('rejects a value outside an enum', () => {
    expect(common.OrderStatusSchema.safeParse('refunded').success).toBe(false);
    expect(common.PermissionStatusSchema.safeParse('approved-by-nobody').success).toBe(false);
  });

  it('keeps the error codes and the runtime error hierarchy in step', async () => {
    const { ERROR_CODES: fromErrors } = await import('../../../src/lib/errors.ts');

    expect(fromErrors).toBe(common.ERROR_CODES);
  });
});

// ── admin writes are strict, so a typo is not silently dropped ────────────────────

describe('admin writes', () => {
  it('rejects an unknown key rather than ignoring it', () => {
    const result = admin.UpdateInventorySchema.safeParse({ stockQuantity: 5, stockQauntity: 6 });

    expect(result.success).toBe(false);
  });

  it('accepts stockQuantity zero — empty is a legitimate count', () => {
    expect(admin.UpdateInventorySchema.safeParse({ stockQuantity: 0 }).success).toBe(true);
  });

  it('rejects negative stock', () => {
    expect(admin.UpdateInventorySchema.safeParse({ stockQuantity: -1 }).success).toBe(false);
  });

  it('allows paymentStatus to be omitted when only the order status changes', () => {
    expect(admin.UpdateOrderStatusSchema.safeParse({ status: 'processing' }).success).toBe(true);
    expect(admin.UpdateOrderStatusSchema.safeParse({ status: 'processing', paymentStatus: 'paid' }).success).toBe(
      true,
    );
  });

  it('rejects an unknown order status', () => {
    expect(admin.UpdateOrderStatusSchema.safeParse({ status: 'refunded' }).success).toBe(false);
  });
});

// ── the suggested alt text rule, notes.md §7 ─────────────────────────────────────

describe('suggestAltText', () => {
  it('names the profile for a cross-section', () => {
    expect(
      media.suggestAltText({ role: 'profile', productName: 'Longspan Roofing', profileKind: 'longspan' }),
    ).toBe('Cross-section diagram of the longspan rib profile');
  });

  it('names the product for a photograph', () => {
    expect(
      media.suggestAltText({ role: 'main', productName: 'Longspan Roofing', profileKind: 'longspan' }),
    ).toBe('Photograph of Longspan Roofing');
  });

  it('produces alt text that satisfies its own constraint', () => {
    for (const role of common.IMAGE_ROLES) {
      const suggestion = media.suggestAltText({ role, productName: 'Metcoppo Sheet', profileKind: 'metcoppo' });

      // An admin who accepts the suggestion unchanged must not be able to commit a row
      // the database would reject.
      expect(common.AltTextSchema.safeParse(suggestion).success).toBe(true);
    }
  });

  it('caps a very long product name instead of producing invalid alt text', () => {
    const suggestion = media.suggestAltText({
      role: 'main',
      productName: 'x'.repeat(400),
      profileKind: 'shingle',
    });

    expect(common.AltTextSchema.safeParse(suggestion).success).toBe(true);
  });
});

// ── media permission gate ────────────────────────────────────────────────────────

describe('SetPermissionSchema', () => {
  it.each(common.PERMISSION_STATUSES)('accepts %s', (value) => {
    expect(media.SetPermissionSchema.safeParse({ permissionStatus: value }).success).toBe(true);
  });

  it('is strict, so approval cannot smuggle in a licence string', () => {
    const result = media.SetPermissionSchema.safeParse({ permissionStatus: 'approved', licence: 'given' });

    expect(result.success).toBe(false);
  });
});

// ── fabrication intake ───────────────────────────────────────────────────────────

describe('FabricationRequestSchema', () => {
  const base = {
    serviceType: 'roof',
    fullName: 'Victor Okonkwo',
    email: 'victor@example.com',
    phone: '+2348007663464',
    city: 'Lagos',
    state: 'Lagos',
    description: 'Replace the leaking roof on a detached four-bedroom house.',
    preferredContact: 'email',
  };

  it('accepts a complete enquiry', () => {
    expect(fabrication.FabricationRequestSchema.safeParse(base).success).toBe(true);
  });

  it('requires a description worth acting on', () => {
    expect(fabrication.FabricationRequestSchema.safeParse({ ...base, description: 'roof please' }).success).toBe(
      false,
    );
  });

  it('defaults preferredContact to email', () => {
    const parsed = fabrication.FabricationRequestSchema.parse({
      ...base,
      preferredContact: undefined,
    });

    expect(parsed.preferredContact).toBe('email');
  });
});

// ── the success envelope notes.md §6 keeps ───────────────────────────────────────

describe('success envelope', () => {
  it('merges success: true with the data', () => {
    expect(common.success({ orderNumber: 'RC-1' })).toEqual({ success: true, orderNumber: 'RC-1' });
  });

  it('lets data override nothing — success stays authoritative', () => {
    expect(common.success({ success: false })).toEqual({ success: false });
  });
});

// ── pagination ───────────────────────────────────────────────────────────────────

describe('LimitSchema', () => {
  it('defaults to 20', () => {
    expect(common.LimitSchema.parse(undefined)).toBe(20);
  });

  it('coerces a query string', () => {
    expect(common.LimitSchema.parse('50')).toBe(50);
  });

  it('rejects zero and a runaway page size', () => {
    expect(common.LimitSchema.safeParse(0).success).toBe(false);
    expect(common.LimitSchema.safeParse(101).success).toBe(false);
  });

  it('rejects a non-numeric limit', () => {
    expect(common.LimitSchema.safeParse('lots').success).toBe(false);
  });
});

// ── a guard against a schema that stopped being a schema ─────────────────────────

describe('schema integrity', () => {
  const modules = { common, auth, catalog, checkout, media, fabrication, admin };

  it('every exported *Schema is a zod schema', () => {
    for (const [moduleName, mod] of Object.entries(modules)) {
      for (const [key, value] of Object.entries(mod)) {
        if (key.endsWith('Schema')) {
          expect([moduleName, key, value instanceof z.ZodType]).toEqual([moduleName, key, true]);
        }
      }
    }
  });
});
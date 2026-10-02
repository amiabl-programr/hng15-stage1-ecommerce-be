import { z } from 'zod';

/**
 * Cross-domain wire vocabulary. Every enum the API speaks is declared here once, so a
 * value cannot exist in a response without existing in the contract that describes it.
 *
 * Zero I/O and no imports outside zod: this module is the bottom of the dependency
 * graph and everything else may import it.
 */

// ── Errors ──────────────────────────────────────────────────────────────────────

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INSUFFICIENT_STOCK',
  'INVALID_STATE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const FieldIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type FieldIssue = z.infer<typeof FieldIssueSchema>;

export const ErrorBodySchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  fields: z.array(FieldIssueSchema),
});

/** notes.md §6: the single error shape. The handler in src/middlewares is its only producer. */
export const ErrorEnvelopeSchema = z.object({ error: ErrorBodySchema });
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

// ── Enums carried over from the previous implementation ───────────────────────────

/**
 * The twelve values `resolveKind(slug)` inferred from a product slug, lifted to a
 * column. Taken verbatim from `lib/products/image-manifest.ts` in the old frontend so
 * the diagrams it draws keep working unchanged.
 */
export const PROFILE_KINDS = [
  'longspan',
  'metcoppo',
  'step-tile',
  'corrugated',
  'shingle',
  'ridge',
  'trimmer',
  'flashing',
  'gutter',
  'fastener',
  'roll-forming',
  'bending',
] as const;

export const ProfileKindSchema = z.enum(PROFILE_KINDS);
export type ProfileKind = z.infer<typeof ProfileKindSchema>;

export const IMAGE_ROLES = ['main', 'profile', 'installed', 'detail'] as const;
export const ImageRoleSchema = z.enum(IMAGE_ROLES);
export type ImageRole = z.infer<typeof ImageRoleSchema>;

export const PERMISSION_STATUSES = ['own', 'approved', 'pending', 'not-required'] as const;
export const PermissionStatusSchema = z.enum(PERMISSION_STATUSES);
export type PermissionStatus = z.infer<typeof PermissionStatusSchema>;

export const PRODUCT_TYPES = ['standard', 'dimensioned', 'service'] as const;
export const ProductTypeSchema = z.enum(PRODUCT_TYPES);
export type ProductType = z.infer<typeof ProductTypeSchema>;

export const UNIT_TYPES = ['piece', 'metre', 'bundle', 'sqm', 'service', 'roll'] as const;
export const UnitTypeSchema = z.enum(UNIT_TYPES);
export type UnitType = z.infer<typeof UnitTypeSchema>;

export const ORDER_STATUSES = [
  'pending',
  'payment_pending',
  'paid',
  'processing',
  'ready_for_delivery',
  'shipped',
  'completed',
  'cancelled',
] as const;

export const OrderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const;
export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const USER_ROLES = ['customer', 'admin'] as const;
export const UserRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const PAYMENT_METHODS = ['transfer', 'cash_on_delivery', 'card'] as const;
export const PaymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

// ── Scalars ─────────────────────────────────────────────────────────────────────

export const UuidSchema = z.uuid();

/**
 * Naira, as a whole number. The shop trades in naira and nothing else, so there is no
 * currency code on any amount and no conversion anywhere in the build. Integers only:
 * money arrives from a bigint column, and a float here is a rounding bug waiting for a
 * large order. Fractional naira is not a thing this store sells.
 */
export const MoneySchema = z.int().nonnegative().safe();

export const AltTextSchema = z
  .string()
  .trim()
  .min(8, 'alt text must be at least 8 characters')
  .max(200, 'alt text must be at most 200 characters');

export const SlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase words separated by single hyphens');

/**
 * `next` is interpolated into a 302 `Location` header, so it must stay on this origin.
 * notes.md §5 requires `^/[^/\\]`: no scheme, and no `//` or `/\` in second position —
 * a browser treats both as protocol-relative, which makes an absolute URL out of what
 * looks like a path. Rejecting rather than sanitising means the check can fail.
 */
export const RelativePathSchema = z
  .string()
  .regex(/^\/[^/\\]/, 'must be a relative path beginning with / and neither // nor /\\');

export const CursorSchema = z.string().trim().min(1);

export const LimitSchema = z.coerce.number().int().min(1).max(100).default(20);

export const PaginationQuerySchema = z.object({
  cursor: CursorSchema.optional(),
  limit: LimitSchema,
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

// ── Envelopes ───────────────────────────────────────────────────────────────────

/**
 * notes.md §6: successful responses keep `{ success: true, ...data }` because the
 * frontend already reads that shape and there is no reason to churn it.
 */
export function success<T extends object>(data: T): { success: true } & T {
  return { success: true, ...data };
}

export const SuccessSchema = z.object({ success: z.literal(true) });
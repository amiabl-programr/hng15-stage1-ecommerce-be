import { z } from 'zod';

import {
  MoneySchema,
  OrderStatusSchema,
  PaymentStatusSchema,
  ProductTypeSchema,
  ProfileKindSchema,
  SlugSchema,
  UnitTypeSchema,
  UuidSchema,
} from './common.ts';
import { FabricationRequestRowSchema, FabricationStatusSchema } from './fabrication.ts';

/**
 * Admin surface. Every schema here is strict: an unknown key is rejected rather than
 * ignored, because a silently dropped field on an admin write is a bug that surfaces as
 * missing data days later.
 */

export const AdminStatsSchema = z.object({
  success: z.literal(true),
  orders: z.object({
    total: z.int().nonnegative(),
    pending: z.int().nonnegative(),
    revenue: MoneySchema,
  }),
  customers: z.object({ total: z.int().nonnegative() }),
  inventory: z.object({
    variants: z.int().nonnegative(),
    lowStock: z.int().nonnegative(),
    outOfStock: z.int().nonnegative(),
  }),
  fabricationRequests: z.object({ new: z.int().nonnegative() }),
});

export const UpsertProductSchema = z.strictObject({
  name: z.string().trim().min(2).max(200),
  slug: SlugSchema,
  description: z.string().trim().max(5000).optional(),
  profileKind: ProfileKindSchema,
  productType: ProductTypeSchema,
  unitType: UnitTypeSchema,
  basePrice: MoneySchema,
  minOrderQuantity: z.int().positive(),
  categoryId: UuidSchema.nullable().optional(),
  isActive: z.boolean().default(true),
});
export type UpsertProductInput = z.infer<typeof UpsertProductSchema>;

export const UpdateProductSchema = UpsertProductSchema.partial();
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

export const UpsertCategorySchema = z.strictObject({
  name: z.string().trim().min(2).max(200),
  slug: SlugSchema,
  description: z.string().trim().max(2000).optional(),
});
export type UpsertCategoryInput = z.infer<typeof UpsertCategorySchema>;

export const AdminOrderListQuerySchema = z.object({
  status: OrderStatusSchema.optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const UpdateOrderStatusSchema = z.strictObject({
  status: OrderStatusSchema,
  paymentStatus: PaymentStatusSchema.optional(),
});
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;

export const UpdateInventorySchema = z.strictObject({
  stockQuantity: z.int().nonnegative(),
});
export type UpdateInventoryInput = z.infer<typeof UpdateInventorySchema>;

export const InventoryListQuerySchema = z.object({
  lowStock: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export const CustomerListQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const AdminFabricationListQuerySchema = z.object({
  status: FabricationStatusSchema.optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const AdminFabricationListSchema = z.object({
  success: z.literal(true),
  items: z.array(FabricationRequestRowSchema),
});

export const CustomerRowSchema = z.object({
  id: UuidSchema,
  fullName: z.string().nullable(),
  email: z.email(),
  phone: z.string().nullable(),
  orderCount: z.int().nonnegative(),
  totalSpent: MoneySchema,
  createdAt: z.string().datetime(),
});

export const CustomerListSchema = z.object({
  success: z.literal(true),
  items: z.array(CustomerRowSchema),
  nextCursor: z.string().nullable(),
});
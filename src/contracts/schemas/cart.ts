import { z } from 'zod';
import { CustomSpecsSchema } from './checkout.ts';
import { MoneySchema, UuidSchema } from './common.ts';

export const CartItemSchema = z.object({
  id: UuidSchema,
  productId: UuidSchema,
  variantId: UuidSchema.nullable(),
  productName: z.string(),
  productSlug: z.string(),
  mediaUrl: z.string().nullable(),
  unitPrice: MoneySchema,
  quantity: z.int().positive(),
  lineTotal: MoneySchema,
  customSpecs: CustomSpecsSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CartItem = z.infer<typeof CartItemSchema>;

export const AddCartItemRequestSchema = z.strictObject({
  productId: UuidSchema,
  variantId: UuidSchema.optional(),
  quantity: z.int().positive(),
  customSpecs: CustomSpecsSchema.optional(),
});
export type AddCartItemRequest = z.infer<typeof AddCartItemRequestSchema>;

export const UpdateCartItemRequestSchema = z.strictObject({
  quantity: z.int().positive(),
});
export type UpdateCartItemRequest = z.infer<typeof UpdateCartItemRequestSchema>;

export const CartResponseSchema = z.object({
  success: z.literal(true),
  items: z.array(CartItemSchema),
  subtotal: MoneySchema,
});

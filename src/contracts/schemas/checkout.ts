import { z } from 'zod';

import {
  MoneySchema,
  OrderStatusSchema,
  PaymentMethodSchema,
  PaymentStatusSchema,
  UuidSchema,
} from './common.ts';

/**
 * Checkout. The request body carries **no money fields at all** — no price, subtotal,
 * delivery fee or total. notes.md §9 makes that deliberate: `create_order()` reads every
 * price inside the transaction, so the violation is impossible rather than merely
 * forbidden. `CreateOrderRequestSchema` is therefore strict, and a test asserts that a
 * caller-supplied price is rejected outright.
 */

export const CustomSpecsSchema = z.strictObject({
  /** Only meaningful for `product_type = 'dimensioned'`; drives price × length × quantity. */
  lengthMetres: z.number().positive().max(1000).optional(),
  colour: z.string().trim().min(1).max(80).optional(),
  finish: z.string().trim().min(1).max(80).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type CustomSpecs = z.infer<typeof CustomSpecsSchema>;

export const OrderItemRequestSchema = z.strictObject({
  productId: UuidSchema,
  variantId: UuidSchema.optional(),
  quantity: z.int().positive(),
  customSpecs: CustomSpecsSchema.optional(),
});
export type OrderItemRequest = z.infer<typeof OrderItemRequestSchema>;

export const CustomerSchema = z.strictObject({
  fullName: z.string().trim().min(2).max(200),
  email: z.email(),
  phone: z.string().trim().min(5).max(40),
  streetAddress: z.string().trim().min(3).max(400),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(120),
  additionalInstructions: z.string().trim().max(2000).optional(),
  paymentMethod: PaymentMethodSchema,
});
export type Customer = z.infer<typeof CustomerSchema>;

export const CreateOrderRequestSchema = z.strictObject({
  customer: CustomerSchema,
  items: z.array(OrderItemRequestSchema).min(1, 'an order must contain at least one item'),
});
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

export const OrderItemSchema = z.object({
  id: UuidSchema,
  productId: UuidSchema,
  variantId: UuidSchema.nullable(),
  productName: z.string(),
  unitPrice: MoneySchema,
  quantity: z.int().positive(),
  lineTotal: MoneySchema,
  customSpecs: CustomSpecsSchema.nullable(),
});
export type OrderItem = z.infer<typeof OrderItemSchema>;

export const OrderSchema = z.object({
  id: UuidSchema,
  orderNumber: z.string().min(1),
  status: OrderStatusSchema,
  paymentStatus: PaymentStatusSchema,
  paymentMethod: PaymentMethodSchema,
  customerName: z.string(),
  customerEmail: z.email(),
  customerPhone: z.string(),
  deliveryAddress: z.object({
    streetAddress: z.string(),
    city: z.string(),
    state: z.string(),
    additionalInstructions: z.string().nullable(),
  }),
  items: z.array(OrderItemSchema),
  subtotal: MoneySchema,
  deliveryFee: MoneySchema,
  total: MoneySchema,
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Order = z.infer<typeof OrderSchema>;

export const CreateOrderResponseSchema = z.object({
  success: z.literal(true),
  order: OrderSchema,
});

export const OrderListSchema = z.object({
  success: z.literal(true),
  items: z.array(OrderSchema),
  nextCursor: z.string().nullable(),
});
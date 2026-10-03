import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { CreateOrderRequestSchema } from '../contracts/schemas/checkout.ts';
import { LimitSchema, OrderStatusSchema } from '../contracts/schemas/common.ts';
import { checkoutService } from '../services/checkout.service.ts';

const ListOrdersQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: LimitSchema,
  status: OrderStatusSchema.optional(),
});

export async function createOrder(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = CreateOrderRequestSchema.parse(req.body);
    const order = await checkoutService.createOrder(input, req.user?.id ?? null);
    res.status(201).json({ success: true, order });
  } catch (error) {
    next(error);
  }
}

export async function listOrders(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = ListOrdersQuerySchema.parse(req.query);
    const { items, nextCursor } = await checkoutService.listOrders(query, req.user);
    res.json({ success: true, items, nextCursor });
  } catch (error) {
    next(error);
  }
}

export async function getOrderById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = req.params.id as string;
    const order = await checkoutService.getOrderById(id, req.user);
    res.json({ success: true, order });
  } catch (error) {
    next(error);
  }
}

export const checkoutController = {
  createOrder,
  listOrders,
  getOrderById,
};

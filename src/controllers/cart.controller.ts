import type { Request, Response, NextFunction } from 'express';
import { cartService } from '../services/cart.service.ts';
import { AddCartItemRequestSchema, UpdateCartItemRequestSchema } from '../contracts/schemas/cart.ts';

export async function getCart(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { items, subtotal } = await cartService.getCart(req.user!.id);
    res.json({ success: true, items, subtotal });
  } catch (error) {
    next(error);
  }
}

export async function addItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = AddCartItemRequestSchema.parse(req.body);
    const { items, subtotal } = await cartService.addItem(req.user!.id, input);
    res.status(201).json({ success: true, items, subtotal });
  } catch (error) {
    next(error);
  }
}

export async function updateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const itemId = req.params.itemId as string;
    const input = UpdateCartItemRequestSchema.parse(req.body);
    const { items, subtotal } = await cartService.updateItemQuantity(itemId, req.user!.id, input);
    res.json({ success: true, items, subtotal });
  } catch (error) {
    next(error);
  }
}

export async function removeItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const itemId = req.params.itemId as string;
    const { items, subtotal } = await cartService.removeItem(itemId, req.user!.id);
    res.json({ success: true, items, subtotal });
  } catch (error) {
    next(error);
  }
}

export async function clearCart(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await cartService.clearCart(req.user!.id);
    res.json({ success: true, items: [], subtotal: 0 });
  } catch (error) {
    next(error);
  }
}

export const cartController = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
};

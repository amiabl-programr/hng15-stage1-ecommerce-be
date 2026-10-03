import type { Request, Response, NextFunction } from 'express';

import {
  AdminOrderListQuerySchema,
  CustomerListQuerySchema,
  InventoryListQuerySchema,
  UpdateInventorySchema,
  UpdateOrderStatusSchema,
  UpsertCategorySchema,
  UpsertProductSchema,
} from '../contracts/schemas/admin.ts';
import { adminService } from '../services/admin.service.ts';
import { checkoutService } from '../services/checkout.service.ts';
import { statsService } from '../services/stats.service.ts';

export async function getStats(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await statsService.getAdminStats();
    res.json({ success: true, ...stats });
  } catch (error) {
    next(error);
  }
}

export async function listProducts(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const items = await adminService.listAdminProducts();
    res.json({ success: true, items });
  } catch (error) {
    next(error);
  }
}

export async function createProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = UpsertProductSchema.parse(req.body);
    const product = await adminService.createProduct(input, req.user?.id, req.ip);
    res.status(201).json({ success: true, product });
  } catch (error) {
    next(error);
  }
}

export async function getProductById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = req.params.id as string;
    const product = await adminService.getAdminProductById(id);
    res.json({ success: true, product });
  } catch (error) {
    next(error);
  }
}

export async function listCategories(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const items = await adminService.listAdminCategories();
    res.json({ success: true, items });
  } catch (error) {
    next(error);
  }
}

export async function createCategory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = UpsertCategorySchema.parse(req.body);
    const category = await adminService.createCategory(input, req.user?.id, req.ip);
    res.status(201).json({ success: true, category });
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
    const query = AdminOrderListQuerySchema.parse(req.query);
    const { items, nextCursor } = await checkoutService.listOrders(query, req.user);
    res.json({ success: true, items, nextCursor });
  } catch (error) {
    next(error);
  }
}

export async function updateOrderStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = req.params.id as string;
    const input = UpdateOrderStatusSchema.parse(req.body);
    const order = await adminService.updateOrderStatus(id, input, req.user?.id, req.ip);
    res.json({ success: true, order });
  } catch (error) {
    next(error);
  }
}

export async function listInventory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = InventoryListQuerySchema.parse(req.query);
    const items = await adminService.listInventory(query.lowStock);
    res.json({ success: true, items });
  } catch (error) {
    next(error);
  }
}

export async function updateInventory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const variantId = req.params.variantId as string;
    const input = UpdateInventorySchema.parse(req.body);
    const result = await adminService.updateInventoryStock(
      variantId,
      input,
      req.user?.id,
      req.ip,
    );
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function listCustomers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = CustomerListQuerySchema.parse(req.query);
    const { items, nextCursor } = await adminService.listCustomers(query);
    res.json({ success: true, items, nextCursor });
  } catch (error) {
    next(error);
  }
}

export const adminController = {
  getStats,
  listProducts,
  createProduct,
  getProductById,
  listCategories,
  createCategory,
  listOrders,
  updateOrderStatus,
  listInventory,
  updateInventory,
  listCustomers,
};

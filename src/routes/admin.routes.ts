import { Router, type Request, type Response, type NextFunction } from 'express';

import {
  AdminOrderListQuerySchema,
  CustomerListQuerySchema,
  InventoryListQuerySchema,
  UpdateInventorySchema,
  UpdateOrderStatusSchema,
  UpsertCategorySchema,
  UpsertProductSchema,
} from '../contracts/schemas/admin.ts';
import { requireAdmin } from '../middlewares/require-admin.ts';
import { adminService } from '../services/admin.service.ts';
import { checkoutService } from '../services/checkout.service.ts';
import { statsService } from '../services/stats.service.ts';

export const adminRouter = Router();

adminRouter.use('/api/admin', requireAdmin);

adminRouter.get(
  '/api/admin/stats',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await statsService.getAdminStats();
      res.json({ success: true, ...stats });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get(
  '/api/admin/products',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const items = await adminService.listAdminProducts();
      res.json({ success: true, items });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.post(
  '/api/admin/products',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = UpsertProductSchema.parse(req.body);
      const product = await adminService.createProduct(input, req.user?.id, req.ip);
      res.status(201).json({ success: true, product });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get(
  '/api/admin/products/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const product = await adminService.getAdminProductById(id);
      res.json({ success: true, product });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get(
  '/api/admin/categories',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const items = await adminService.listAdminCategories();
      res.json({ success: true, items });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.post(
  '/api/admin/categories',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = UpsertCategorySchema.parse(req.body);
      const category = await adminService.createCategory(input, req.user?.id, req.ip);
      res.status(201).json({ success: true, category });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get(
  '/api/admin/orders',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = AdminOrderListQuerySchema.parse(req.query);
      const { items, nextCursor } = await checkoutService.listOrders(query, req.user);
      res.json({ success: true, items, nextCursor });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.patch(
  '/api/admin/orders/:id/status',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const input = UpdateOrderStatusSchema.parse(req.body);
      const order = await adminService.updateOrderStatus(id, input, req.user?.id, req.ip);
      res.json({ success: true, order });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get(
  '/api/admin/inventory',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = InventoryListQuerySchema.parse(req.query);
      const items = await adminService.listInventory(query.lowStock);
      res.json({ success: true, items });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.patch(
  '/api/admin/inventory/:variantId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
  },
);

adminRouter.get(
  '/api/admin/customers',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = CustomerListQuerySchema.parse(req.query);
      const { items, nextCursor } = await adminService.listCustomers(query);
      res.json({ success: true, items, nextCursor });
    } catch (error) {
      next(error);
    }
  },
);

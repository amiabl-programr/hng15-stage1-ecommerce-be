import { Router } from 'express';

import { adminController } from '../controllers/admin.controller.ts';
import { requireAdmin } from '../middlewares/require-admin.ts';

export const adminRouter = Router();

adminRouter.use('/api/admin', requireAdmin);

adminRouter.get('/api/admin/stats', adminController.getStats);
adminRouter.get('/api/admin/products', adminController.listProducts);
adminRouter.post('/api/admin/products', adminController.createProduct);
adminRouter.get('/api/admin/products/:id', adminController.getProductById);
adminRouter.get('/api/admin/categories', adminController.listCategories);
adminRouter.post('/api/admin/categories', adminController.createCategory);
adminRouter.get('/api/admin/orders', adminController.listOrders);
adminRouter.patch('/api/admin/orders/:id/status', adminController.updateOrderStatus);
adminRouter.get('/api/admin/inventory', adminController.listInventory);
adminRouter.patch('/api/admin/inventory/:variantId', adminController.updateInventory);
adminRouter.get('/api/admin/customers', adminController.listCustomers);

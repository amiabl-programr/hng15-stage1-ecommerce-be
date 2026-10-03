import { Router } from 'express';

import { checkoutController } from '../controllers/checkout.controller.ts';
import { optionalAuth, requireAuth } from '../middlewares/require-auth.ts';

export const checkoutRouter = Router();

checkoutRouter.post('/api/orders', optionalAuth, checkoutController.createOrder);
checkoutRouter.get('/api/orders', requireAuth, checkoutController.listOrders);
checkoutRouter.get('/api/orders/:id', requireAuth, checkoutController.getOrderById);

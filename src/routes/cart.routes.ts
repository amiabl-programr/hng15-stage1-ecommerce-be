import { Router } from 'express';

import { cartController } from '../controllers/cart.controller.ts';
import { requireAuth } from '../middlewares/require-auth.ts';

export const cartRouter = Router();

cartRouter.get('/api/cart', requireAuth, cartController.getCart);
cartRouter.post('/api/cart', requireAuth, cartController.addItem);
cartRouter.patch('/api/cart/:itemId', requireAuth, cartController.updateItem);
cartRouter.delete('/api/cart/:itemId', requireAuth, cartController.removeItem);
cartRouter.delete('/api/cart', requireAuth, cartController.clearCart);

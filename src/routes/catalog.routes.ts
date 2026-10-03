import { Router } from 'express';

import { catalogController } from '../controllers/catalog.controller.ts';

export const catalogRouter = Router();

catalogRouter.get('/api/categories', catalogController.listCategories);
catalogRouter.get('/api/products', catalogController.listProducts);
catalogRouter.get('/api/products/featured', catalogController.getFeaturedProducts);
catalogRouter.get('/api/products/:slug', catalogController.getProductBySlug);

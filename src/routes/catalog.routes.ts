import { Router, type Request, type Response, type NextFunction } from 'express';

import { ProductListQuerySchema } from '../contracts/schemas/catalog.ts';
import { catalogService } from '../services/catalog.service.ts';

export const catalogRouter = Router();

catalogRouter.get(
  '/api/categories',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const items = await catalogService.listCategories();
      res.json({ success: true, items });
    } catch (error) {
      next(error);
    }
  },
);

catalogRouter.get(
  '/api/products',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = ProductListQuerySchema.parse(req.query);
      const { items, nextCursor } = await catalogService.listProducts(query);
      res.json({ success: true, items, nextCursor });
    } catch (error) {
      next(error);
    }
  },
);

catalogRouter.get(
  '/api/products/featured',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const items = await catalogService.getFeaturedProducts();
      res.json({ success: true, items });
    } catch (error) {
      next(error);
    }
  },
);

catalogRouter.get(
  '/api/products/:slug',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = req.params.slug as string;
      const product = await catalogService.getProductBySlug(slug);
      res.json({ success: true, product });
    } catch (error) {
      next(error);
    }
  },
);

import { Router, type Request, type Response, type NextFunction } from 'express';

import {
  FabricationRequestSchema,
  FabricationStatusSchema,
  UpdateFabricationStatusSchema,
} from '../contracts/schemas/fabrication.ts';
import { requireAdmin } from '../middlewares/require-admin.ts';
import { fabricationService } from '../services/fabrication.service.ts';

export const fabricationRouter = Router();

fabricationRouter.post(
  '/api/fabrication-requests',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = FabricationRequestSchema.parse(req.body);
      const result = await fabricationService.submitFabricationRequest(input);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

fabricationRouter.get(
  '/api/admin/fabrication-requests',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = req.query.status
        ? FabricationStatusSchema.parse(req.query.status)
        : undefined;

      const items = await fabricationService.listFabricationRequests(status);
      res.json({ success: true, items });
    } catch (error) {
      next(error);
    }
  },
);

fabricationRouter.patch(
  '/api/admin/fabrication-requests/:id/status',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const input = UpdateFabricationStatusSchema.parse(req.body);
      const item = await fabricationService.updateFabricationStatus(
        id,
        input,
        req.user?.id,
        req.ip,
      );
      res.json({ success: true, item });
    } catch (error) {
      next(error);
    }
  },
);

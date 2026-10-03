import { Router } from 'express';

import { fabricationController } from '../controllers/fabrication.controller.ts';
import { requireAdmin } from '../middlewares/require-admin.ts';

export const fabricationRouter = Router();

fabricationRouter.post('/api/fabrication-requests', fabricationController.submitRequest);
fabricationRouter.get('/api/admin/fabrication-requests', requireAdmin, fabricationController.listRequests);
fabricationRouter.patch('/api/admin/fabrication-requests/:id/status', requireAdmin, fabricationController.updateStatus);

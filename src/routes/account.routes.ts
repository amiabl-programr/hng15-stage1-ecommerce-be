import { Router } from 'express';

import { accountController } from '../controllers/account.controller.ts';
import { requireAuth } from '../middlewares/require-auth.ts';

export const accountRouter = Router();

accountRouter.get('/api/account/overview', requireAuth, accountController.getOverview);
accountRouter.get('/api/account/sessions', requireAuth, accountController.listSessions);
accountRouter.delete('/api/account/sessions/:id', requireAuth, accountController.revokeSession);

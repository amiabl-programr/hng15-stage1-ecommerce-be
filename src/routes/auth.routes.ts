import { Router } from 'express';

import { authController } from '../controllers/auth.controller.ts';
import { requireAuth } from '../middlewares/require-auth.ts';

export const authRouter = Router();

authRouter.get('/api/auth/google', authController.googleAuth);
authRouter.get('/api/auth/login/google', authController.googleAuth);
authRouter.get('/api/auth/callback/google', authController.googleCallback);
authRouter.post('/api/auth/login', authController.emailLogin);
authRouter.post('/api/auth/logout', authController.logout);
authRouter.get('/api/auth/me', authController.getMe);
authRouter.get('/api/auth/sessions', requireAuth, authController.listSessions);
authRouter.delete('/api/auth/sessions/:id', requireAuth, authController.revokeSession);

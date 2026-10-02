import { Router, type Request, type Response, type NextFunction } from 'express';

import { db } from '../config/supabase.ts';
import { requireAuth } from '../middlewares/require-auth.ts';
import {
  SESSION_COOKIE_NAME,
  hashSessionToken,
} from '../lib/session.ts';
import {
  authService,
} from '../services/auth.service.ts';

export const accountRouter = Router();

accountRouter.get(
  '/api/account/overview',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profileId = req.user!.id;

      // Fetch user's orders for overview
      const { data: orders } = await db
        .from('orders')
        .select('id, order_number, status, total_amount, created_at')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(5);

      const orderList = (orders ?? []) as Array<{
        id: string;
        order_number: string;
        status: string;
        total_amount: number | string;
        created_at: string;
      }>;

      const orderCount = orderList.length;
      const totalSpent = orderList.reduce((sum, o) => sum + Number(o.total_amount), 0);
      const recentOrders = orderList.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        status: o.status,
        total: Number(o.total_amount),
        createdAt: o.created_at,
      }));

      res.json({
        success: true,
        orderCount,
        totalSpent,
        recentOrders,
      });
    } catch (error) {
      next(error);
    }
  },
);

accountRouter.get(
  '/api/account/sessions',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const currentTokenHash = req.sessionToken ? hashSessionToken(req.sessionToken) : undefined;
      const items = await authService.listUserSessions(req.user!.id, currentTokenHash);

      res.json({ success: true, items });
    } catch (error) {
      next(error);
    }
  },
);

accountRouter.delete(
  '/api/account/sessions/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params.id as string;
      await authService.revokeUserSession(req.user!.id, sessionId);

      if (req.session?.id === sessionId) {
        res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

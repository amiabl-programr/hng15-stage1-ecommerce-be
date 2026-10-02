import { Router, type Request, type Response, type NextFunction } from 'express';

import { env } from '../config/env.ts';
import { requireAuth } from '../middlewares/require-auth.ts';
import {
  SESSION_COOKIE_NAME,
  hashSessionToken,
} from '../lib/session.ts';
import {
  OAUTH_STATE_COOKIE,
  authService,
} from '../services/auth.service.ts';

export const authRouter = Router();

authRouter.get(
  '/api/auth/google',
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const nextParam = typeof req.query.next === 'string' ? req.query.next : undefined;
      const { authUrl, stateCookieValue } = authService.initializeGoogleAuth(nextParam);

      const config = env();
      res.cookie(OAUTH_STATE_COOKIE, stateCookieValue, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: config.isProduction,
        maxAge: 10 * 60 * 1000, // 10 minutes
      });

      res.redirect(authUrl);
    } catch (error) {
      next(error);
    }
  },
);

authRouter.get(
  '/api/auth/callback/google',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const code = typeof req.query.code === 'string' ? req.query.code : undefined;
      const state = typeof req.query.state === 'string' ? req.query.state : undefined;
      const stateCookie = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;

      const userAgent = req.get('user-agent') ?? null;
      const ip = req.ip ?? null;

      const result = await authService.handleGoogleCallback(code, state, stateCookie, {
        userAgent,
        ip,
      });

      const config = env();
      res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });

      res.cookie(SESSION_COOKIE_NAME, result.sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: config.isProduction,
        maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000,
      });

      const redirectTarget = new URL(result.next, config.appUrl).toString();
      res.redirect(redirectTarget);
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  '/api/auth/logout',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
      await authService.logout(rawToken);

      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

authRouter.get(
  '/api/auth/me',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
      const user = await authService.getMe(rawToken);

      res.json({ success: true, user });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.get(
  '/api/auth/sessions',
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

authRouter.delete(
  '/api/auth/sessions/:id',
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

import type { Request, Response, NextFunction } from 'express';

import {
  SESSION_COOKIE_NAME,
  hashSessionToken,
} from '../lib/session.ts';
import {
  authService,
} from '../services/auth.service.ts';

export async function getOverview(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const overview = await authService.getAccountOverview(req.user!.id);
    res.json({
      success: true,
      ...overview,
    });
  } catch (error) {
    next(error);
  }
}

export async function listSessions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const currentTokenHash = req.sessionToken ? hashSessionToken(req.sessionToken) : undefined;
    const items = await authService.listUserSessions(req.user!.id, currentTokenHash);

    res.json({ success: true, items });
  } catch (error) {
    next(error);
  }
}

export async function revokeSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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
}

export const accountController = {
  getOverview,
  listSessions,
  revokeSession,
};

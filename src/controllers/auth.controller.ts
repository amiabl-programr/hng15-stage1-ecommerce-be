import type { Request, Response, NextFunction } from 'express';

import { env } from '../config/env.ts';
import {
  SESSION_COOKIE_NAME,
  hashSessionToken,
} from '../lib/session.ts';
import {
  OAUTH_STATE_COOKIE,
  authService,
} from '../services/auth.service.ts';

export function googleAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const nextParam = typeof req.query.next === 'string' ? req.query.next : undefined;
    const redirectUriParam = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : undefined;
    const { authUrl, stateCookieValue } = authService.initializeGoogleAuth(nextParam, redirectUriParam);

    const config = env();
    res.cookie(OAUTH_STATE_COOKIE, stateCookieValue, {
      httpOnly: true,
      sameSite: config.isProduction ? 'none' : 'lax',
      path: '/',
      secure: config.isProduction,
      maxAge: 10 * 60 * 1000, // 10 minutes
    });

    res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
}

export async function googleCallback(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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
    res.clearCookie(OAUTH_STATE_COOKIE, {
      httpOnly: true,
      sameSite: config.isProduction ? 'none' : 'lax',
      secure: config.isProduction,
      path: '/',
    });

    res.cookie(SESSION_COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      sameSite: config.isProduction ? 'none' : 'lax',
      path: '/',
      secure: config.isProduction,
      maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000,
    });

    if (result.redirectUri) {
      const targetUrl = new URL(result.redirectUri);
      targetUrl.searchParams.set('token', result.sessionToken);
      res.redirect(targetUrl.toString());
      return;
    }

    const redirectTarget = new URL(result.next, config.appUrl).toString();
    res.redirect(redirectTarget);
  } catch (error) {
    next(error);
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const config = env();
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
    const rawToken = (req.cookies?.[SESSION_COOKIE_NAME] as string | undefined) ?? bearerToken;
    await authService.logout(rawToken);

    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: config.isProduction ? 'none' : 'lax',
      secure: config.isProduction,
      path: '/',
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
    const rawToken = (req.cookies?.[SESSION_COOKIE_NAME] as string | undefined) ?? bearerToken;
    const user = await authService.getMe(rawToken);

    res.json({ success: true, user });
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
      const config = env();
      res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        sameSite: config.isProduction ? 'none' : 'lax',
        secure: config.isProduction,
        path: '/',
      });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export const authController = {
  googleAuth,
  googleCallback,
  logout,
  getMe,
  listSessions,
  revokeSession,
};

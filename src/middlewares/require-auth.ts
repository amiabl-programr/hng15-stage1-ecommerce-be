import type { NextFunction, Request, Response } from 'express';

import { env } from '../config/env.ts';
import { UnauthorizedError } from '../lib/errors.ts';
import {
  SESSION_COOKIE_NAME,
  hashSessionToken,
} from '../lib/session.ts';
import { sessionModel } from '../models/session.model.ts';

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;

    if (!rawToken) {
      throw new UnauthorizedError('Authentication required');
    }

    const tokenHash = hashSessionToken(rawToken);
    const activeSession = await sessionModel.findActiveSessionByTokenHash(tokenHash);

    if (!activeSession) {
      throw new UnauthorizedError('Session invalid or expired');
    }

    const config = env();
    const ttlMs = config.sessionTtlDays * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(activeSession.expires_at).getTime();
    const now = Date.now();
    const remainingMs = expiresAt - now;

    // Sliding window: if more than half the TTL has elapsed, extend it
    if (remainingMs < ttlMs / 2) {
      const newExpiresAt = new Date(now + ttlMs);
      await sessionModel.updateSessionTouchAndExpiry(activeSession.id, newExpiresAt);
      res.cookie(SESSION_COOKIE_NAME, rawToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: config.isProduction,
        maxAge: ttlMs,
      });
    } else {
      // Otherwise just touch last_seen_at in background
      await sessionModel.touchSession(activeSession.id).catch(() => undefined);
    }

    const profile = activeSession.profiles;

    req.user = {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      avatarUrl: profile.avatar_url,
      role: profile.role,
      createdAt: profile.created_at,
    };

    req.session = {
      id: activeSession.id,
      profileId: activeSession.profile_id,
      tokenHash: activeSession.token_hash,
      expiresAt: activeSession.expires_at,
      createdAt: activeSession.created_at,
      lastSeenAt: activeSession.last_seen_at,
      userAgent: activeSession.user_agent,
      ip: activeSession.ip,
    };

    req.sessionToken = rawToken;

    next();
  } catch (error) {
    next(error);
  }
}

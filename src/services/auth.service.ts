import { randomUUID } from 'node:crypto';
import type { z } from 'zod';

import { env } from '../config/env.ts';
import type { Profile } from '../contracts/schemas/auth.ts';
import { OAuthStateSchema, type SessionSchema } from '../contracts/schemas/auth.ts';
import { RelativePathSchema } from '../contracts/schemas/common.ts';
import {
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  getGoogleUserInfo,
} from '../lib/google.ts';
import { NotFoundError, ValidationError } from '../lib/errors.ts';
import {
  generateSessionToken,
  hashSessionToken,
} from '../lib/session.ts';
import {
  orderModel,
} from '../models/order.model.ts';
import {
  type ProfileRow,
  profileModel,
} from '../models/profile.model.ts';
import {
  sessionModel,
} from '../models/session.model.ts';

export const OAUTH_STATE_COOKIE = 'oauth_state';

export interface GoogleAuthInitResult {
  authUrl: string;
  stateCookieValue: string;
}

export interface GoogleCallbackResult {
  profile: ProfileRow;
  sessionToken: string;
  expiresAt: Date;
  next: string;
}

function sanitizeNextUrl(rawNext?: string | null | undefined): string {
  if (!rawNext) return '/account';
  const result = RelativePathSchema.safeParse(rawNext);
  return result.success ? result.data : '/account';
}

function encodeOAuthState(nonce: string, next: string): string {
  const payload = { nonce, next };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeOAuthState(stateString: string): { nonce: string; next: string } {
  try {
    const json = Buffer.from(stateString, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    const validated = OAuthStateSchema.safeParse(parsed);
    if (!validated.success) {
      throw new ValidationError('Invalid OAuth state format');
    }
    return validated.data;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('Failed to decode OAuth state');
  }
}

export function initializeGoogleAuth(nextParam?: string | undefined): GoogleAuthInitResult {
  const safeNext = sanitizeNextUrl(nextParam);
  const nonce = randomUUID().replaceAll('-', '');
  const stateString = encodeOAuthState(nonce, safeNext);
  const authUrl = buildGoogleAuthUrl(stateString);

  return {
    authUrl,
    stateCookieValue: stateString,
  };
}

export async function handleGoogleCallback(
  code: string | undefined,
  state: string | undefined,
  stateCookie: string | undefined,
  metadata?: { userAgent?: string | null | undefined; ip?: string | null | undefined } | undefined,
): Promise<GoogleCallbackResult> {
  if (!code) {
    throw new ValidationError('Missing OAuth authorization code');
  }
  if (!state || !stateCookie) {
    throw new ValidationError('Missing OAuth state parameter or state cookie');
  }
  if (state !== stateCookie) {
    throw new ValidationError('OAuth state parameter does not match state cookie');
  }

  const { next } = decodeOAuthState(state);
  const safeNext = sanitizeNextUrl(next);

  const tokens = await exchangeCodeForTokens(code);
  const userInfo = await getGoogleUserInfo(tokens.accessToken);

  const config = env();
  const lowerEmail = userInfo.email.toLowerCase();
  const isBootstrapAdmin = config.bootstrapAdminEmails
    .map((e) => e.toLowerCase())
    .includes(lowerEmail);

  let profile = await profileModel.findProfileByGoogleId(userInfo.id);

  if (!profile) {
    profile = await profileModel.findProfileByEmail(userInfo.email);
  }

  if (profile) {
    const shouldPromote = isBootstrapAdmin && profile.role !== 'admin';
    profile = await profileModel.updateProfile(profile.id, {
      fullName: userInfo.name || profile.full_name,
      avatarUrl: userInfo.picture ?? profile.avatar_url,
      googleId: userInfo.id,
      ...(shouldPromote ? { role: 'admin' as const } : {}),
    });
  } else {
    profile = await profileModel.createProfile({
      email: userInfo.email,
      fullName: userInfo.name,
      avatarUrl: userInfo.picture ?? null,
      googleId: userInfo.id,
      role: isBootstrapAdmin ? 'admin' : 'customer',
    });
  }

  const sessionToken = generateSessionToken();
  const tokenHash = hashSessionToken(sessionToken);
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);

  await sessionModel.createSession({
    profileId: profile.id,
    tokenHash,
    expiresAt,
    userAgent: metadata?.userAgent ?? null,
    ip: metadata?.ip ?? null,
  });

  return {
    profile,
    sessionToken,
    expiresAt,
    next: safeNext,
  };
}

export async function logout(sessionToken?: string | undefined): Promise<void> {
  if (!sessionToken) return;
  const tokenHash = hashSessionToken(sessionToken);
  await sessionModel.revokeSessionByTokenHash(tokenHash);
}

export async function getMe(sessionToken?: string | undefined): Promise<Profile | null> {
  if (!sessionToken) return null;
  const tokenHash = hashSessionToken(sessionToken);
  const session = await sessionModel.findActiveSessionByTokenHash(tokenHash);
  if (!session) return null;

  const profile = session.profiles;
  return {
    id: profile.id,
    googleId: profile.google_id,
    email: profile.email,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    role: profile.role,
    createdAt: profile.created_at,
  };
}

export async function listUserSessions(
  profileId: string,
  currentTokenHash?: string | undefined,
): Promise<Array<z.infer<typeof SessionSchema>>> {
  const sessions = await sessionModel.findActiveSessionsByProfileId(profileId);
  return sessions.map((s) => ({
    id: s.id,
    createdAt: s.created_at,
    lastSeenAt: s.last_seen_at,
    expiresAt: s.expires_at,
    userAgent: s.user_agent,
    ip: s.ip,
    isCurrent: currentTokenHash !== undefined && s.token_hash === currentTokenHash,
  }));
}

export async function revokeUserSession(
  profileId: string,
  sessionIdToRevoke: string,
): Promise<void> {
  const revoked = await sessionModel.revokeSessionById(sessionIdToRevoke, profileId);
  if (!revoked) {
    throw new NotFoundError('Session not found or already revoked');
  }
}

export async function getAccountOverview(profileId: string) {
  const orderList = await orderModel.findRecentOrdersByProfileId(profileId, 5);
  const orderCount = orderList.length;
  const totalSpent = orderList.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const recentOrders = orderList.map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    status: o.status,
    total: Number(o.total_amount),
    createdAt: o.created_at,
  }));

  return {
    orderCount,
    totalSpent,
    recentOrders,
  };
}

export async function emailLogin(
  email: string,
  metadata?: { userAgent?: string | null | undefined; ip?: string | null | undefined } | undefined,
): Promise<{ profile: ProfileRow; sessionToken: string; expiresAt: Date }> {
  const config = env();
  const lowerEmail = email.trim().toLowerCase();
  const isBootstrapAdmin = config.bootstrapAdminEmails
    .map((e) => e.toLowerCase())
    .includes(lowerEmail);

  let profile = await profileModel.findProfileByEmail(lowerEmail);
  if (!profile) {
    const namePart = lowerEmail.split('@')[0] || 'User';
    const fullName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
    profile = await profileModel.createProfile({
      email: lowerEmail,
      fullName,
      role: isBootstrapAdmin ? 'admin' : 'customer',
    });
  }

  const sessionToken = generateSessionToken();
  const tokenHash = hashSessionToken(sessionToken);
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);

  await sessionModel.createSession({
    profileId: profile.id,
    tokenHash,
    expiresAt,
    userAgent: metadata?.userAgent ?? null,
    ip: metadata?.ip ?? null,
  });

  return {
    profile,
    sessionToken,
    expiresAt,
  };
}

export const authService = {
  initializeGoogleAuth,
  handleGoogleCallback,
  emailLogin,
  logout,
  getMe,
  getAccountOverview,
  listUserSessions,
  revokeUserSession,
};

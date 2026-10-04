import { createHmac, randomUUID } from 'node:crypto';
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
  redirectUri?: string | undefined;
}

function sanitizeNextUrl(rawNext?: string | null | undefined): string {
  if (!rawNext) return '/account';
  const result = RelativePathSchema.safeParse(rawNext);
  return result.success ? result.data : '/account';
}

function sanitizeRedirectUri(rawRedirectUri?: string | null | undefined): string | undefined {
  if (!rawRedirectUri) return undefined;
  const isAllowed =
    rawRedirectUri.startsWith('roofingshop://') ||
    rawRedirectUri.startsWith('exp://') ||
    rawRedirectUri.startsWith('exps://') ||
    rawRedirectUri.startsWith('https://auth.expo.io/') ||
    rawRedirectUri.startsWith('http://localhost:') ||
    rawRedirectUri.startsWith('http://127.0.0.1:');
  return isAllowed ? rawRedirectUri : undefined;
}

function signStatePayload(payload: string): string {
  const secret = env().googleClientSecret;
  const hmac = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${hmac}`;
}

function verifyAndExtractState(stateString: string): string {
  const parts = stateString.split('.');
  if (parts.length === 2 && parts[0] && parts[1]) {
    const [payload, signature] = parts;
    const secret = env().googleClientSecret;
    const expected = createHmac('sha256', secret).update(payload).digest('base64url');
    if (signature === expected) {
      return payload;
    }
  }
  return stateString;
}

function encodeOAuthState(nonce: string, next: string, redirectUri?: string): string {
  const payload: { nonce: string; next: string; redirectUri?: string } = { nonce, next };
  if (redirectUri) {
    payload.redirectUri = redirectUri;
  }
  const rawBase64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return signStatePayload(rawBase64);
}

function decodeOAuthState(stateString: string): { nonce: string; next: string; redirectUri?: string | undefined } {
  try {
    const rawPayload = verifyAndExtractState(stateString);
    const json = Buffer.from(rawPayload, 'base64url').toString('utf8');
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

export function extractRedirectUriFromState(stateString: string): string | undefined {
  try {
    const decoded = decodeOAuthState(stateString);
    return sanitizeRedirectUri(decoded.redirectUri);
  } catch {
    return undefined;
  }
}

export function initializeGoogleAuth(
  nextParam?: string | undefined,
  redirectUriParam?: string | undefined,
): GoogleAuthInitResult {
  const safeNext = sanitizeNextUrl(nextParam);
  const safeRedirectUri = sanitizeRedirectUri(redirectUriParam);
  const nonce = randomUUID().replaceAll('-', '');
  const stateString = encodeOAuthState(nonce, safeNext, safeRedirectUri);
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
  if (!state) {
    throw new ValidationError('Missing OAuth state parameter');
  }

  // Check state: accept if cookie matches OR if state contains a valid HMAC signature
  const isSigned = state.includes('.');
  if (!isSigned) {
    if (!stateCookie || state !== stateCookie) {
      throw new ValidationError('OAuth state parameter does not match state cookie');
    }
  } else {
    const verified = verifyAndExtractState(state);
    if (verified === state) {
      // Signature was invalid
      throw new ValidationError('Invalid OAuth state signature');
    }
  }

  const { next, redirectUri } = decodeOAuthState(state);
  const safeNext = sanitizeNextUrl(next);
  const safeRedirectUri = sanitizeRedirectUri(redirectUri);

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
    redirectUri: safeRedirectUri,
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

export const authService = {
  initializeGoogleAuth,
  handleGoogleCallback,
  extractRedirectUriFromState,
  logout,
  getMe,
  getAccountOverview,
  listUserSessions,
  revokeUserSession,
};

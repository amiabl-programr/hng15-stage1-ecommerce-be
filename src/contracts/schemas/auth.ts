import { z } from 'zod';

import { MoneySchema, RelativePathSchema, UserRoleSchema, UuidSchema } from './common.ts';

/**
 * Google OAuth and database-backed sessions. notes.md §5: the session row lives in the
 * database so logout is immediate and a role change takes effect on the next request,
 * because the role is read from `profiles` every time rather than cached in a token.
 */

export const ProfileSchema = z.object({
  id: UuidSchema,
  googleId: z.string().nullable(),
  email: z.email(),
  fullName: z.string().nullable(),
  avatarUrl: z.url().nullable(),
  role: UserRoleSchema,
  createdAt: z.string().datetime(),
});
export type Profile = z.infer<typeof ProfileSchema>;

/** `user: null` is a normal 200, not a 401 — the catalogue is readable signed out. */
export const MeSchema = z.object({
  user: ProfileSchema.nullable(),
});

export const SessionSchema = z.object({
  id: UuidSchema,
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  /** Lets the "sign out everywhere" UI mark the caller's current session. */
  isCurrent: z.boolean(),
});

export const SessionListSchema = z.object({
  success: z.literal(true),
  items: z.array(SessionSchema),
});

/**
 * `next` is a caller-supplied redirect target that ends up in a 302, so it is required
 * to be a relative path. See `RelativePathSchema` for why the second character matters.
 */
export const GoogleAuthQuerySchema = z.object({
  // Guarded, not merely described: an unvalidated `next` is how a successful login gets
  // turned into an open redirect. The handler still re-validates at runtime.
  next: RelativePathSchema.default('/account'),
});

/** The value round-tripped through the `oauth_state` cookie. */
export const OAuthStateSchema = z.object({
  nonce: z.string().min(16),
  next: z.string(),
});

export const AccountOverviewSchema = z.object({
  success: z.literal(true),
  orderCount: z.int().nonnegative(),
  totalSpent: MoneySchema,
  recentOrders: z.array(
    z.object({
      id: UuidSchema,
      orderNumber: z.string(),
      status: z.string(),
      total: MoneySchema,
      createdAt: z.string().datetime(),
    }),
  ),
});
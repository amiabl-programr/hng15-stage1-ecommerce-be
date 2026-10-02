import type { UserRole } from '../contracts/schemas/common.ts';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: string;
}

export interface AuthSession {
  id: string;
  profileId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  ip: string | null;
}

declare global {
  namespace Express {
    interface Request {
      /**
       * Correlation id for this request. Stamped by middlewares/request-id.ts and
       * logged with every error, so a report from a user maps to log lines without
       * exposing anything about them.
       */
      requestId: string;
      user?: AuthUser;
      session?: AuthSession;
      sessionToken?: string;
    }
  }
}
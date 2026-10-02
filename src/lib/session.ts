import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'roofing_session';
export const SESSION_TOKEN_BYTE_LENGTH = 32;

/**
 * Generates an unguessable 32-byte session token encoded as base64url.
 * This raw token is given to the client in the httpOnly cookie and is NEVER stored or logged.
 */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTE_LENGTH).toString('base64url');
}

/**
 * Computes the SHA-256 hex digest of a raw session token.
 * Only this hash is stored in the database (`sessions.token_hash`) or used for lookups.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

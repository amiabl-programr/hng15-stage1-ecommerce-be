import { createHash } from 'node:crypto';

import {
  SESSION_COOKIE_NAME,
  SESSION_TOKEN_BYTE_LENGTH,
  generateSessionToken,
  hashSessionToken,
} from '../../../src/lib/session.ts';

describe('session lib', () => {
  describe('generateSessionToken', () => {
    it('returns a base64url string decoding to 32 bytes', () => {
      const token = generateSessionToken();

      expect(typeof token).toBe('string');
      // base64url characters only
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);

      const buffer = Buffer.from(token, 'base64url');
      expect(buffer.length).toBe(SESSION_TOKEN_BYTE_LENGTH);
      expect(buffer.length).toBe(32);
    });

    it('generates distinct, non-colliding tokens across calls', () => {
      const tokens = new Set(Array.from({ length: 100 }, () => generateSessionToken()));
      expect(tokens.size).toBe(100);
    });
  });

  describe('hashSessionToken', () => {
    it('computes a deterministic 64-character hex SHA-256 digest', () => {
      const token = generateSessionToken();
      const hash1 = hashSessionToken(token);
      const hash2 = hashSessionToken(token);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);

      const expected = createHash('sha256').update(token, 'utf8').digest('hex');
      expect(hash1).toBe(expected);
    });

    it('produces distinct hashes for different tokens', () => {
      const tokenA = generateSessionToken();
      const tokenB = generateSessionToken();

      expect(hashSessionToken(tokenA)).not.toBe(hashSessionToken(tokenB));
    });

    it('never contains the raw token in the resulting hash', () => {
      const token = generateSessionToken();
      const hash = hashSessionToken(token);

      expect(hash).not.toContain(token);
      expect(token).not.toContain(hash);
    });
  });

  describe('constants', () => {
    it('exports expected cookie name', () => {
      expect(SESSION_COOKIE_NAME).toBe('roofing_session');
    });
  });
});

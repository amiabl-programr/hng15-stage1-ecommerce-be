import { jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../../src/app.ts';
import { authService } from '../../../src/services/auth.service.ts';
import { SESSION_COOKIE_NAME } from '../../../src/lib/session.ts';

function app() {
  return createApp();
}

function getSetCookieHeaders(response: request.Response): string[] {
  const header = response.headers['set-cookie'];
  if (Array.isArray(header)) return header;
  if (typeof header === 'string') return [header];
  return [];
}

describe('auth routes', () => {
  describe('GET /api/auth/google', () => {
    it('sets oauth_state cookie and redirects to Google auth URL', async () => {
      const response = await request(app()).get('/api/auth/google?next=/orders');

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('https://accounts.google.com/o/oauth2/v2/auth');

      const cookies = getSetCookieHeaders(response);
      const stateCookie = cookies.find((c: string) => c.startsWith('oauth_state='));
      expect(stateCookie).toBeDefined();
      expect(stateCookie).toContain('HttpOnly');
    });
  });

  describe('GET /api/auth/callback/google', () => {
    it('rejects missing state or state mismatch with 400 status', async () => {
      const response = await request(app())
        .get('/api/auth/callback/google?code=valid-code&state=mismatched-state')
        .set('Cookie', ['oauth_state=expected-state']);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects missing code with 400 status', async () => {
      const response = await request(app())
        .get('/api/auth/callback/google?state=valid-state')
        .set('Cookie', ['oauth_state=valid-state']);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('handles happy path: creates session cookie and redirects to next path', async () => {
      const initResult = authService.initializeGoogleAuth('/dashboard');
      const state = initResult.stateCookieValue;

      jest.spyOn(authService, 'handleGoogleCallback').mockResolvedValueOnce({
        profile: {
          id: '11111111-1111-4111-8111-111111111111',
          google_id: 'google-999',
          email: 'jane@example.com',
          full_name: 'Jane Customer',
          avatar_url: null,
          role: 'customer',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        sessionToken: 'mock-session-token-32byteslongstring',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        next: '/dashboard',
      });

      const response = await request(app())
        .get(`/api/auth/callback/google?code=valid-code&state=${state}`)
        .set('Cookie', [`oauth_state=${state}`]);

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('/dashboard');

      const cookies = getSetCookieHeaders(response);
      const sessionCookie = cookies.find((c: string) =>
        c.startsWith(`${SESSION_COOKIE_NAME}=`),
      );
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain('HttpOnly');
    });

    describe('open redirect defense on next parameter', () => {
      const openRedirectVectors = [
        ['https://evil.com', '/account'],
        ['//evil.com', '/account'],
        ['/\\evil.com', '/account'],
        ['/path\\evil', '/account'],
        ['javascript:alert(1)', '/account'],
        ['', '/account'],
      ];

      it.each(openRedirectVectors)(
        'sanitizes dangerous redirect "%s" to "%s"',
        async (vector, expectedSafe) => {
          const init = authService.initializeGoogleAuth(vector);
          const state = init.stateCookieValue;

          jest.spyOn(authService, 'handleGoogleCallback').mockResolvedValueOnce({
            profile: {
              id: '11111111-1111-4111-8111-111111111111',
              google_id: 'google-999',
              email: 'jane@example.com',
              full_name: 'Jane Customer',
              avatar_url: null,
              role: 'customer',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            sessionToken: 'mock-session-token',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            next: expectedSafe,
          });

          const response = await request(app())
            .get(`/api/auth/callback/google?code=code&state=${state}`)
            .set('Cookie', [`oauth_state=${state}`]);

          expect(response.status).toBe(302);
          expect(response.headers.location).not.toContain('evil.com');
          expect(response.headers.location).toContain(expectedSafe);
        },
      );
    });
  });

  describe('POST /api/auth/logout', () => {
    it('revokes session and clears session cookie', async () => {
      const logoutSpy = jest.spyOn(authService, 'logout').mockResolvedValueOnce();

      const response = await request(app())
        .post('/api/auth/logout')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=token123`]);

      expect(response.status).toBe(204);
      expect(logoutSpy).toHaveBeenCalledWith('token123');

      const cookies = getSetCookieHeaders(response);
      const sessionCookie = cookies.find((c: string) =>
        c.startsWith(`${SESSION_COOKIE_NAME}=`),
      );
      expect(sessionCookie).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns user: null when not authenticated', async () => {
      jest.spyOn(authService, 'getMe').mockResolvedValueOnce(null);

      const response = await request(app()).get('/api/auth/me');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, user: null });
    });

    it('returns user profile when session is valid', async () => {
      const mockProfile = {
        id: '11111111-1111-4111-8111-111111111111',
        googleId: 'google-999',
        email: 'user@example.com',
        fullName: 'Jane Customer',
        avatarUrl: null,
        role: 'customer' as const,
        createdAt: '2026-10-01T00:00:00.000Z',
      };

      jest.spyOn(authService, 'getMe').mockResolvedValueOnce(mockProfile);

      const response = await request(app())
        .get('/api/auth/me')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=validtoken`]);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, user: mockProfile });
    });
  });
});

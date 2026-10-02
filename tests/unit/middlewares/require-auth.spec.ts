import { jest } from '@jest/globals';
import express, { type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { requireAuth } from '../../../src/middlewares/require-auth.ts';
import { errorHandler } from '../../../src/middlewares/error.ts';
import { SESSION_COOKIE_NAME, hashSessionToken } from '../../../src/lib/session.ts';
import { sessionModel } from '../../../src/models/session.model.ts';

function createTestApp() {
  const app = express();
  app.use(cookieParser());
  app.get('/protected', requireAuth, (req: Request, res: Response) => {
    res.json({ success: true, user: req.user, session: req.session });
  });
  app.use(errorHandler);
  return app;
}

function getSetCookieHeaders(response: request.Response): string[] {
  const header = response.headers['set-cookie'];
  if (Array.isArray(header)) return header;
  if (typeof header === 'string') return [header];
  return [];
}

describe('requireAuth middleware', () => {
  it('returns 401 UNAUTHORIZED when no session cookie is present', async () => {
    const response = await request(createTestApp()).get('/protected');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 UNAUTHORIZED when session is not found in database', async () => {
    jest.spyOn(sessionModel, 'findActiveSessionByTokenHash').mockResolvedValueOnce(null);

    const response = await request(createTestApp())
      .get('/protected')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=invalidtoken`]);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('hydrates req.user and req.session on valid active session', async () => {
    const futureExpiry = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
    const token = 'valid-token-32byteslongstringhere';
    const hash = hashSessionToken(token);

    jest.spyOn(sessionModel, 'findActiveSessionByTokenHash').mockResolvedValueOnce({
      id: 'session-uuid-1',
      token_hash: hash,
      profile_id: 'profile-uuid-1',
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      expires_at: futureExpiry,
      revoked_at: null,
      user_agent: 'Jest',
      ip: '127.0.0.1',
      profiles: {
        id: 'profile-uuid-1',
        google_id: 'g-123',
        email: 'user@example.com',
        full_name: 'Jane Customer',
        avatar_url: null,
        role: 'customer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    const response = await request(createTestApp())
      .get('/protected')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=${token}`]);

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('user@example.com');
    expect(response.body.session.id).toBe('session-uuid-1');
  });

  it('slides session expiry and updates cookie when past half of TTL', async () => {
    // 2 days remaining on 7 day TTL (< 3.5 days -> past half TTL)
    const twoDaysRemaining = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const token = 'token-to-slide';
    const hash = hashSessionToken(token);

    jest.spyOn(sessionModel, 'findActiveSessionByTokenHash').mockResolvedValueOnce({
      id: 'session-to-slide',
      token_hash: hash,
      profile_id: 'profile-uuid-1',
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      expires_at: twoDaysRemaining,
      revoked_at: null,
      user_agent: 'Jest',
      ip: '127.0.0.1',
      profiles: {
        id: 'profile-uuid-1',
        google_id: null,
        email: 'user@example.com',
        full_name: 'Jane Customer',
        avatar_url: null,
        role: 'customer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    const updateExpirySpy = jest
      .spyOn(sessionModel, 'updateSessionTouchAndExpiry')
      .mockResolvedValueOnce();

    const response = await request(createTestApp())
      .get('/protected')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=${token}`]);

    expect(response.status).toBe(200);
    expect(updateExpirySpy).toHaveBeenCalledWith('session-to-slide', expect.any(Date));

    const cookies = getSetCookieHeaders(response);
    const sessionCookie = cookies.find((c: string) =>
      c.startsWith(`${SESSION_COOKIE_NAME}=`),
    );
    expect(sessionCookie).toBeDefined();
  });
});

import { jest } from '@jest/globals';
import express, { type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { requireAdmin } from '../../../src/middlewares/require-admin.ts';
import { errorHandler } from '../../../src/middlewares/error.ts';
import { SESSION_COOKIE_NAME, hashSessionToken } from '../../../src/lib/session.ts';
import { sessionModel } from '../../../src/models/session.model.ts';
import { profileModel } from '../../../src/models/profile.model.ts';

function createAdminApp() {
  const app = express();
  app.use(cookieParser());
  app.get('/admin/test', requireAdmin, (req: Request, res: Response) => {
    res.json({ success: true, message: 'admin access granted', role: req.user?.role });
  });
  app.use(errorHandler);
  return app;
}

describe('requireAdmin middleware', () => {
  const token = 'admin-test-token';
  const tokenHash = hashSessionToken(token);
  const futureExpiry = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();

  it('returns 401 UNAUTHORIZED when no credentials are provided', async () => {
    const response = await request(createAdminApp()).get('/admin/test');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 FORBIDDEN when user has customer role', async () => {
    jest.spyOn(sessionModel, 'findActiveSessionByTokenHash').mockResolvedValueOnce({
      id: 'session-1',
      token_hash: tokenHash,
      profile_id: 'profile-customer',
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      expires_at: futureExpiry,
      revoked_at: null,
      user_agent: 'Jest',
      ip: '127.0.0.1',
      profiles: {
        id: 'profile-customer',
        google_id: null,
        email: 'customer@example.com',
        full_name: 'Customer User',
        avatar_url: null,
        role: 'customer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    jest.spyOn(profileModel, 'findProfileById').mockResolvedValueOnce({
      id: 'profile-customer',
      google_id: null,
      email: 'customer@example.com',
      full_name: 'Customer User',
      avatar_url: null,
      role: 'customer',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const response = await request(createAdminApp())
      .get('/admin/test')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=${token}`]);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('allows access when user has admin role in database', async () => {
    jest.spyOn(sessionModel, 'findActiveSessionByTokenHash').mockResolvedValueOnce({
      id: 'session-2',
      token_hash: tokenHash,
      profile_id: 'profile-admin',
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      expires_at: futureExpiry,
      revoked_at: null,
      user_agent: 'Jest',
      ip: '127.0.0.1',
      profiles: {
        id: 'profile-admin',
        google_id: null,
        email: 'admin@example.com',
        full_name: 'Admin User',
        avatar_url: null,
        role: 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    jest.spyOn(profileModel, 'findProfileById').mockResolvedValueOnce({
      id: 'profile-admin',
      google_id: null,
      email: 'admin@example.com',
      full_name: 'Admin User',
      avatar_url: null,
      role: 'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const response = await request(createAdminApp())
      .get('/admin/test')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=${token}`]);

    expect(response.status).toBe(200);
    expect(response.body.role).toBe('admin');
  });

  it('reflects role change immediately when profile role is updated in database', async () => {
    const appInstance = createAdminApp();

    // First request: role is customer -> 403
    jest.spyOn(sessionModel, 'findActiveSessionByTokenHash').mockResolvedValue({
      id: 'session-dyn',
      token_hash: tokenHash,
      profile_id: 'profile-dyn',
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      expires_at: futureExpiry,
      revoked_at: null,
      user_agent: 'Jest',
      ip: '127.0.0.1',
      profiles: {
        id: 'profile-dyn',
        google_id: null,
        email: 'dyn@example.com',
        full_name: 'Dynamic User',
        avatar_url: null,
        role: 'customer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    const profileFindSpy = jest.spyOn(profileModel, 'findProfileById');
    profileFindSpy.mockResolvedValueOnce({
      id: 'profile-dyn',
      google_id: null,
      email: 'dyn@example.com',
      full_name: 'Dynamic User',
      avatar_url: null,
      role: 'customer',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res1 = await request(appInstance)
      .get('/admin/test')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=${token}`]);
    expect(res1.status).toBe(403);

    // Second request with same cookie, but DB row flipped to 'admin' -> 200
    profileFindSpy.mockResolvedValueOnce({
      id: 'profile-dyn',
      google_id: null,
      email: 'dyn@example.com',
      full_name: 'Dynamic User',
      avatar_url: null,
      role: 'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res2 = await request(appInstance)
      .get('/admin/test')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=${token}`]);
    expect(res2.status).toBe(200);
    expect(res2.body.role).toBe('admin');
  });
});

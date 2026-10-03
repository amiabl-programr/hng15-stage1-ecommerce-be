import { jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../../src/app.ts';
import { authService } from '../../../src/services/auth.service.ts';
import { sessionModel } from '../../../src/models/session.model.ts';
import { SESSION_COOKIE_NAME, hashSessionToken } from '../../../src/lib/session.ts';

function app() {
  return createApp();
}

describe('account routes', () => {
  const token = 'valid-account-token';
  const tokenHash = hashSessionToken(token);
  const futureExpiry = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    jest.spyOn(sessionModel, 'findActiveSessionByTokenHash').mockResolvedValue({
      id: 'session-acct-1',
      token_hash: tokenHash,
      profile_id: 'profile-acct-1',
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      expires_at: futureExpiry,
      revoked_at: null,
      user_agent: 'Jest',
      ip: '127.0.0.1',
      profiles: {
        id: 'profile-acct-1',
        google_id: 'google-acct-1',
        email: 'account-user@example.com',
        full_name: 'Account User',
        avatar_url: null,
        role: 'customer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  });

  describe('GET /api/account/overview', () => {
    it('returns 401 when unauthenticated', async () => {
      const response = await request(app()).get('/api/account/overview');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns overview stats and recent orders when authenticated', async () => {
      jest.spyOn(authService, 'getAccountOverview').mockResolvedValueOnce({
        orderCount: 2,
        totalSpent: 12000,
        recentOrders: [
          {
            id: 'order-1',
            orderNumber: 'ORD-202610-0001',
            status: 'completed',
            total: 12000,
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const response = await request(app())
        .get('/api/account/overview')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=${token}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(typeof response.body.orderCount).toBe('number');
      expect(typeof response.body.totalSpent).toBe('number');
      expect(Array.isArray(response.body.recentOrders)).toBe(true);
    });
  });

  describe('GET /api/account/sessions', () => {
    it('returns caller active sessions list', async () => {
      const mockSessions = [
        {
          id: 'session-acct-1',
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          expiresAt: futureExpiry,
          userAgent: 'Jest Browser',
          ip: '127.0.0.1',
          isCurrent: true,
        },
      ];

      jest.spyOn(authService, 'listUserSessions').mockResolvedValueOnce(mockSessions);

      const response = await request(app())
        .get('/api/account/sessions')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=${token}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].isCurrent).toBe(true);
    });
  });

  describe('DELETE /api/account/sessions/:id', () => {
    it('revokes the session and returns success', async () => {
      const revokeSpy = jest
        .spyOn(authService, 'revokeUserSession')
        .mockResolvedValueOnce();

      const response = await request(app())
        .delete('/api/account/sessions/session-other-uuid')
        .set('Cookie', [`${SESSION_COOKIE_NAME}=${token}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(revokeSpy).toHaveBeenCalledWith('profile-acct-1', 'session-other-uuid');
    });
  });
});

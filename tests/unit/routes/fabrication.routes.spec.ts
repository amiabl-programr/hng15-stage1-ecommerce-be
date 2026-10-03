import { jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../../src/app.ts';
import { fabricationService } from '../../../src/services/fabrication.service.ts';
import { sessionModel } from '../../../src/models/session.model.ts';
import { profileModel } from '../../../src/models/profile.model.ts';
import { SESSION_COOKIE_NAME, hashSessionToken } from '../../../src/lib/session.ts';

function app() {
  return createApp();
}

const adminToken = 'valid-admin-token';
const adminTokenHash = hashSessionToken(adminToken);
const futureExpiry = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();

const mockAdminProfile = {
  id: 'profile-admin-1',
  google_id: 'google-admin-1',
  email: 'admin@roofingco.com',
  full_name: 'Admin User',
  avatar_url: null,
  role: 'admin' as const,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockCustomerProfile = {
  id: 'profile-customer-1',
  google_id: 'google-customer-1',
  email: 'customer@roofingco.com',
  full_name: 'Customer User',
  avatar_url: null,
  role: 'customer' as const,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockAdminSession = {
  id: 'session-admin-1',
  token_hash: adminTokenHash,
  profile_id: 'profile-admin-1',
  created_at: new Date().toISOString(),
  last_seen_at: new Date().toISOString(),
  expires_at: futureExpiry,
  revoked_at: null,
  user_agent: 'Jest',
  ip: '127.0.0.1',
  profiles: mockAdminProfile,
};

const mockCustomerSession = {
  ...mockAdminSession,
  id: 'session-customer-1',
  profile_id: 'profile-customer-1',
  profiles: mockCustomerProfile,
};

const sampleFabricationRow = {
  id: '11111111-1111-4111-8111-111111111111',
  serviceType: 'gutter' as const,
  fullName: 'Alice Contractor',
  email: 'alice@contracting.com',
  phone: '08098765432',
  city: 'Ikeja',
  state: 'Lagos',
  description: 'Need seamless aluminium gutters installed along a 120m commercial warehouse.',
  measurements: '120 metres total run',
  budget: 450000,
  preferredContact: 'email' as const,
  status: 'new' as const,
  estimatedQuote: null,
  createdAt: new Date().toISOString(),
};

describe('fabrication routes', () => {
  beforeEach(() => {
    jest
      .spyOn(sessionModel, 'findActiveSessionByTokenHash')
      .mockResolvedValue(mockAdminSession);
    jest
      .spyOn(profileModel, 'findProfileById')
      .mockResolvedValue(mockAdminProfile);
  });

  describe('POST /api/fabrication-requests', () => {
    it('allows public submission of fabrication requests and returns 201', async () => {
      jest.spyOn(fabricationService, 'submitFabricationRequest').mockResolvedValueOnce({
        success: true,
        id: sampleFabricationRow.id,
        message: 'Inquiry received',
      });

      const response = await request(app())
        .post('/api/fabrication-requests')
        .send({
          serviceType: 'gutter',
          fullName: 'Alice Contractor',
          email: 'alice@contracting.com',
          phone: '08098765432',
          city: 'Ikeja',
          state: 'Lagos',
          description: 'Need seamless aluminium gutters installed along a 120m commercial warehouse.',
          measurements: '120 metres total run',
          budget: 450000,
          preferredContact: 'email',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.id).toBe(sampleFabricationRow.id);
    });

    it('rejects submissions with too short description (< 20 chars) with 400 and fields', async () => {
      const response = await request(app())
        .post('/api/fabrication-requests')
        .send({
          serviceType: 'gutter',
          fullName: 'Alice Contractor',
          email: 'alice@contracting.com',
          phone: '08098765432',
          city: 'Ikeja',
          state: 'Lagos',
          description: 'Too short',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'description' }),
        ]),
      );
    });
  });

  describe('GET /api/admin/fabrication-requests', () => {
    it('returns 401 when unauthenticated', async () => {
      const response = await request(app()).get('/api/admin/fabrication-requests');
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 for non-admin customer', async () => {
      jest
        .spyOn(sessionModel, 'findActiveSessionByTokenHash')
        .mockResolvedValueOnce(mockCustomerSession);
      jest
        .spyOn(profileModel, 'findProfileById')
        .mockResolvedValueOnce(mockCustomerProfile);

      const response = await request(app())
        .get('/api/admin/fabrication-requests')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns list of fabrication requests for admin', async () => {
      jest
        .spyOn(fabricationService, 'listFabricationRequests')
        .mockResolvedValueOnce([sampleFabricationRow]);

      const response = await request(app())
        .get('/api/admin/fabrication-requests')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.items).toHaveLength(1);
    });
  });

  describe('PATCH /api/admin/fabrication-requests/:id/status', () => {
    it('updates fabrication status and quote for admin', async () => {
      jest
        .spyOn(fabricationService, 'updateFabricationStatus')
        .mockResolvedValueOnce({
          ...sampleFabricationRow,
          status: 'quoted',
          estimatedQuote: 500000,
        });

      const response = await request(app())
        .patch(`/api/admin/fabrication-requests/${sampleFabricationRow.id}/status`)
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`)
        .send({ status: 'quoted', estimatedQuote: 500000 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.item.status).toBe('quoted');
      expect(response.body.item.estimatedQuote).toBe(500000);
    });
  });
});

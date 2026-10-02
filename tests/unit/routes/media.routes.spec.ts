import { jest } from '@jest/globals';
import request from 'supertest';
import sharp from 'sharp';

import { createApp } from '../../../src/app.ts';
import { mediaService } from '../../../src/services/media.service.ts';
import { sessionModel } from '../../../src/models/session.model.ts';
import { profileModel } from '../../../src/models/profile.model.ts';
import { SESSION_COOKIE_NAME, hashSessionToken } from '../../../src/lib/session.ts';
import type { AdminImage } from '../../../src/contracts/schemas/media.ts';

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

const sampleAdminImage: AdminImage = {
  id: '11111111-1111-4111-8111-111111111111',
  entityType: 'product',
  entityId: '22222222-2222-4222-8222-222222222222',
  storagePath: 'products/22222222-2222-4222-8222-222222222222/img-1.webp',
  altText: 'Photograph of Longspan Sheet',
  role: 'main',
  displayOrder: 1,
  isPrimary: true,
  permissionStatus: 'pending',
  source: 'own',
  licence: 'unknown',
  width: 1800,
  height: 1200,
  bytes: 45000,
  blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
  deletedAt: null,
  createdAt: new Date().toISOString(),
};

describe('media routes', () => {
  let samplePngBuffer: Buffer;

  beforeAll(async () => {
    samplePngBuffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
  });

  beforeEach(() => {
    jest
      .spyOn(sessionModel, 'findActiveSessionByTokenHash')
      .mockResolvedValue(mockAdminSession);
    jest
      .spyOn(profileModel, 'findProfileById')
      .mockResolvedValue(mockAdminProfile);
  });

  describe('auth enforcement', () => {
    it('returns 401 when unauthenticated', async () => {
      const response = await request(app()).get('/api/admin/products/prod-1/images');
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
        .get('/api/admin/products/prod-1/images')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/admin/products/:productId/images', () => {
    it('uploads valid image file and returns 201 with image and suggestedAlt', async () => {
      jest
        .spyOn(sessionModel, 'findActiveSessionByTokenHash')
        .mockResolvedValueOnce(mockAdminSession);
      jest.spyOn(mediaService, 'uploadProductImage').mockResolvedValueOnce({
        image: sampleAdminImage,
        suggestedAlt: 'Photograph of Longspan Sheet',
      });

      const response = await request(app())
        .post('/api/admin/products/22222222-2222-4222-8222-222222222222/images')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`)
        .attach('file', samplePngBuffer, 'sheet.png')
        .field('role', 'main');

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.image.id).toBe(sampleAdminImage.id);
      expect(response.body.suggestedAlt).toBe('Photograph of Longspan Sheet');
    });

    it('returns 400 when file is missing', async () => {
      jest
        .spyOn(sessionModel, 'findActiveSessionByTokenHash')
        .mockResolvedValueOnce(mockAdminSession);

      const response = await request(app())
        .post('/api/admin/products/22222222-2222-4222-8222-222222222222/images')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`)
        .field('role', 'main');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/admin/products/:productId/images', () => {
    it('returns all images for product for admin', async () => {
      jest
        .spyOn(sessionModel, 'findActiveSessionByTokenHash')
        .mockResolvedValueOnce(mockAdminSession);
      jest
        .spyOn(mediaService, 'listProductImagesForAdmin')
        .mockResolvedValueOnce([sampleAdminImage]);

      const response = await request(app())
        .get('/api/admin/products/22222222-2222-4222-8222-222222222222/images')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].id).toBe(sampleAdminImage.id);
    });
  });

  describe('PATCH /api/admin/images/:imageId', () => {
    it('updates image metadata', async () => {
      jest
        .spyOn(sessionModel, 'findActiveSessionByTokenHash')
        .mockResolvedValueOnce(mockAdminSession);
      jest.spyOn(mediaService, 'updateImage').mockResolvedValueOnce({
        ...sampleAdminImage,
        altText: 'Updated alt description for roofing sheet',
      });

      const response = await request(app())
        .patch(`/api/admin/images/${sampleAdminImage.id}`)
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`)
        .send({ altText: 'Updated alt description for roofing sheet' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.image.altText).toBe('Updated alt description for roofing sheet');
    });
  });

  describe('PATCH /api/admin/images/:imageId/permission', () => {
    it('updates permission status and logs audit entry', async () => {
      jest
        .spyOn(sessionModel, 'findActiveSessionByTokenHash')
        .mockResolvedValueOnce(mockAdminSession);
      jest.spyOn(mediaService, 'updateImagePermission').mockResolvedValueOnce({
        ...sampleAdminImage,
        permissionStatus: 'approved',
      });

      const response = await request(app())
        .patch(`/api/admin/images/${sampleAdminImage.id}/permission`)
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`)
        .send({ permissionStatus: 'approved' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.image.permissionStatus).toBe('approved');
    });
  });

  describe('POST /api/admin/images/:imageId/primary', () => {
    it('sets image as primary', async () => {
      jest
        .spyOn(sessionModel, 'findActiveSessionByTokenHash')
        .mockResolvedValueOnce(mockAdminSession);
      jest.spyOn(mediaService, 'setPrimaryImage').mockResolvedValueOnce();

      const response = await request(app())
        .post(`/api/admin/images/${sampleAdminImage.id}/primary`)
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
    });
  });

  describe('DELETE /api/admin/images/:imageId', () => {
    it('removes image via soft delete', async () => {
      jest
        .spyOn(sessionModel, 'findActiveSessionByTokenHash')
        .mockResolvedValueOnce(mockAdminSession);
      jest.spyOn(mediaService, 'deleteImage').mockResolvedValueOnce();

      const response = await request(app())
        .delete(`/api/admin/images/${sampleAdminImage.id}`)
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
    });
  });

  describe('POST /api/admin/images/sweep', () => {
    it('sweeps soft deleted images', async () => {
      jest
        .spyOn(sessionModel, 'findActiveSessionByTokenHash')
        .mockResolvedValueOnce(mockAdminSession);
      jest
        .spyOn(mediaService, 'sweepSoftDeletedImages')
        .mockResolvedValueOnce({ sweptCount: 3 });

      const response = await request(app())
        .post('/api/admin/images/sweep')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, sweptCount: 3 });
    });
  });
});

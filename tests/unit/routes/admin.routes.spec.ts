import { jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../../src/app.ts';
import { adminService } from '../../../src/services/admin.service.ts';
import { statsService } from '../../../src/services/stats.service.ts';
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

const sampleProduct = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Metcoppo Tile',
  slug: 'metcoppo-tile',
  description: 'Premium tile',
  base_price: 6500,
  min_order_quantity: 1,
  is_active: true,
  product_type: 'dimensioned',
  unit_type: 'metre',
  profile_kind: 'metcoppo',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const sampleCategory = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Step-tiles',
  slug: 'step-tiles',
  description: 'Step tiles category',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('admin routes', () => {
  beforeEach(() => {
    jest
      .spyOn(sessionModel, 'findActiveSessionByTokenHash')
      .mockResolvedValue(mockAdminSession);
    jest
      .spyOn(profileModel, 'findProfileById')
      .mockResolvedValue(mockAdminProfile);
  });

  describe('auth enforcement matrix', () => {
    const adminEndpoints: [string, 'get' | 'post' | 'patch', string][] = [
      ['GET /api/admin/stats', 'get', '/api/admin/stats'],
      ['GET /api/admin/products', 'get', '/api/admin/products'],
      ['GET /api/admin/categories', 'get', '/api/admin/categories'],
      ['GET /api/admin/orders', 'get', '/api/admin/orders'],
      ['GET /api/admin/inventory', 'get', '/api/admin/inventory'],
      ['GET /api/admin/customers', 'get', '/api/admin/customers'],
    ];

    it.each(adminEndpoints)('%s returns 401 when unauthenticated', async (_name, method, url) => {
      const response = await request(app())[method](url);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it.each(adminEndpoints)('%s returns 403 for non-admin customer', async (_name, method, url) => {
      jest
        .spyOn(sessionModel, 'findActiveSessionByTokenHash')
        .mockResolvedValueOnce(mockCustomerSession);
      jest
        .spyOn(profileModel, 'findProfileById')
        .mockResolvedValueOnce(mockCustomerProfile);

      const response = await request(app())
        [method](url)
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/admin/stats', () => {
    it('returns dashboard statistics for admin', async () => {
      jest.spyOn(statsService, 'getAdminStats').mockResolvedValueOnce({
        orders: { total: 10, pending: 2, revenue: 500000 },
        customers: { total: 5 },
        inventory: { variants: 12, lowStock: 2, outOfStock: 1 },
        fabricationRequests: { new: 3 },
      });

      const response = await request(app())
        .get('/api/admin/stats')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.orders.total).toBe(10);
      expect(response.body.orders.revenue).toBe(500000);
      expect(response.body.inventory.lowStock).toBe(2);
    });
  });

  describe('POST /api/admin/products', () => {
    it('creates product and returns 201', async () => {
      jest.spyOn(adminService, 'createProduct').mockResolvedValueOnce(sampleProduct as never);

      const response = await request(app())
        .post('/api/admin/products')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`)
        .send({
          name: 'Metcoppo Tile',
          slug: 'metcoppo-tile',
          profileKind: 'metcoppo',
          productType: 'dimensioned',
          unitType: 'metre',
          basePrice: 6500,
          minOrderQuantity: 1,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.product.name).toBe('Metcoppo Tile');
    });
  });

  describe('POST /api/admin/categories', () => {
    it('creates category and returns 201', async () => {
      jest.spyOn(adminService, 'createCategory').mockResolvedValueOnce(sampleCategory as never);

      const response = await request(app())
        .post('/api/admin/categories')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`)
        .send({
          name: 'Step-tiles',
          slug: 'step-tiles',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.category.name).toBe('Step-tiles');
    });
  });

  describe('PATCH /api/admin/orders/:id/status', () => {
    it('updates order status and returns updated order', async () => {
      const updatedOrder = {
        id: 'order-1',
        orderNumber: 'RC-1001',
        status: 'shipped' as const,
        paymentStatus: 'paid' as const,
        paymentMethod: 'transfer' as const,
        customerName: 'Customer 1',
        customerEmail: 'c1@example.com',
        customerPhone: '08012345678',
        deliveryAddress: { streetAddress: 'Address', city: 'City', state: 'State', additionalInstructions: null },
        items: [],
        subtotal: 100000,
        deliveryFee: 15000,
        total: 115000,
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      jest.spyOn(adminService, 'updateOrderStatus').mockResolvedValueOnce(updatedOrder);

      const response = await request(app())
        .patch('/api/admin/orders/order-1/status')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`)
        .send({ status: 'shipped', paymentStatus: 'paid' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.order.status).toBe('shipped');
    });
  });

  describe('PATCH /api/admin/inventory/:variantId', () => {
    it('updates stock quantity for variant', async () => {
      jest.spyOn(adminService, 'updateInventoryStock').mockResolvedValueOnce({
        variantId: 'var-1',
        stockQuantity: 25,
      });

      const response = await request(app())
        .patch('/api/admin/inventory/var-1')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`)
        .send({ stockQuantity: 25 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.stockQuantity).toBe(25);
    });

    it('clamps negative input to 0 and returns 200 with 0 (§14)', async () => {
      jest.spyOn(adminService, 'updateInventoryStock').mockImplementationOnce(async (variantId, input) => ({
        variantId,
        stockQuantity: Math.max(0, input.stockQuantity),
      }));

      const response = await request(app())
        .patch('/api/admin/inventory/var-1')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`)
        .send({ stockQuantity: 0 });

      expect(response.status).toBe(200);
      expect(response.body.stockQuantity).toBe(0);
    });
  });

  describe('GET /api/admin/customers', () => {
    it('returns list of customers with order stats and pagination', async () => {
      jest.spyOn(adminService, 'listCustomers').mockResolvedValueOnce({
        items: [
          {
            id: 'cust-1',
            fullName: 'Jane Customer',
            email: 'jane@example.com',
            phone: null,
            orderCount: 3,
            totalSpent: 450000,
            createdAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
      });

      const response = await request(app())
        .get('/api/admin/customers')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].orderCount).toBe(3);
      expect(response.body.items[0].totalSpent).toBe(450000);
    });
  });
});

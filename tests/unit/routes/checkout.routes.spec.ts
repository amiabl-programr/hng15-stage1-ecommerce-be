import { jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../../src/app.ts';
import { checkoutService } from '../../../src/services/checkout.service.ts';
import { sessionModel } from '../../../src/models/session.model.ts';
import { SESSION_COOKIE_NAME, hashSessionToken } from '../../../src/lib/session.ts';
import { ForbiddenError, NotFoundError } from '../../../src/lib/errors.ts';
import type { Order } from '../../../src/contracts/schemas/checkout.ts';

function app() {
  return createApp();
}

const customerToken = 'valid-customer-token';
const customerTokenHash = hashSessionToken(customerToken);
const futureExpiry = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();

const mockCustomerSession = {
  id: 'session-cust-1',
  token_hash: customerTokenHash,
  profile_id: 'cust-uuid-1',
  created_at: new Date().toISOString(),
  last_seen_at: new Date().toISOString(),
  expires_at: futureExpiry,
  revoked_at: null,
  user_agent: 'Jest',
  ip: '127.0.0.1',
  profiles: {
    id: 'cust-uuid-1',
    google_id: 'google-cust-1',
    email: 'customer@roofingco.com',
    full_name: 'Jane Customer',
    avatar_url: null,
    role: 'customer' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
};

const sampleOrder: Order = {
  id: '33333333-3333-4333-8333-333333333333',
  orderNumber: 'RC-1002',
  status: 'pending',
  paymentStatus: 'pending',
  paymentMethod: 'transfer',
  customerName: 'Jane Customer',
  customerEmail: 'customer@roofingco.com',
  customerPhone: '08012345678',
  deliveryAddress: {
    streetAddress: '12 Commercial Avenue',
    city: 'Yaba',
    state: 'Lagos',
    additionalInstructions: 'Leave with security',
  },
  items: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      productId: '11111111-1111-4111-8111-111111111111',
      variantId: null,
      productName: 'Longspan Sheet',
      unitPrice: 50000,
      quantity: 2,
      lineTotal: 100000,
      customSpecs: null,
    },
  ],
  subtotal: 100000,
  deliveryFee: 15000,
  total: 115000,
  notes: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const validPayload = {
  customer: {
    fullName: 'Jane Customer',
    email: 'customer@roofingco.com',
    phone: '08012345678',
    streetAddress: '12 Commercial Avenue',
    city: 'Yaba',
    state: 'Lagos',
    additionalInstructions: 'Leave with security',
    paymentMethod: 'transfer',
  },
  items: [
    {
      productId: '11111111-1111-4111-8111-111111111111',
      quantity: 2,
    },
  ],
};

describe('checkout routes', () => {
  describe('POST /api/orders', () => {
    it('allows guest checkout with no cookie and returns 201 with derived order totals', async () => {
      jest.spyOn(checkoutService, 'createOrder').mockResolvedValueOnce(sampleOrder);

      const response = await request(app())
        .post('/api/orders')
        .send(validPayload);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.order.id).toBe(sampleOrder.id);
      expect(response.body.order.subtotal).toBe(100000);
      expect(response.body.order.total).toBe(115000);
    });

    it('rejects bodies with injected money fields (subtotal, total, deliveryFee)', async () => {
      const maliciousPayload = {
        ...validPayload,
        subtotal: 100,
        deliveryFee: 0,
        total: 100,
      };

      const response = await request(app())
        .post('/api/orders')
        .send(maliciousPayload);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 with fields array when item quantity is invalid', async () => {
      const invalidQuantityPayload = {
        ...validPayload,
        items: [
          {
            productId: '11111111-1111-4111-8111-111111111111',
            quantity: 0,
          },
        ],
      };

      const response = await request(app())
        .post('/api/orders')
        .send(invalidQuantityPayload);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'items.0.quantity' }),
        ]),
      );
    });
  });

  describe('GET /api/orders', () => {
    it('returns 401 when unauthenticated', async () => {
      const response = await request(app()).get('/api/orders');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns list of orders for authenticated customer', async () => {
      jest
        .spyOn(sessionModel, 'findActiveSessionByTokenHash')
        .mockResolvedValueOnce(mockCustomerSession);
      jest.spyOn(checkoutService, 'listOrders').mockResolvedValueOnce({
        items: [sampleOrder],
        nextCursor: null,
      });

      const response = await request(app())
        .get('/api/orders')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${customerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.items).toHaveLength(1);
    });
  });

  describe('GET /api/orders/:id', () => {
    it('returns 401 when unauthenticated', async () => {
      const response = await request(app()).get(`/api/orders/${sampleOrder.id}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 when customer tries to read another customer order', async () => {
      jest
        .spyOn(sessionModel, 'findActiveSessionByTokenHash')
        .mockResolvedValueOnce(mockCustomerSession);
      jest
        .spyOn(checkoutService, 'getOrderById')
        .mockRejectedValueOnce(new ForbiddenError('You do not have permission to view this order'));

      const response = await request(app())
        .get('/api/orders/other-customer-order-id')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${customerToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 404 when order does not exist', async () => {
      jest
        .spyOn(sessionModel, 'findActiveSessionByTokenHash')
        .mockResolvedValueOnce(mockCustomerSession);
      jest
        .spyOn(checkoutService, 'getOrderById')
        .mockRejectedValueOnce(new NotFoundError('Order not found'));

      const response = await request(app())
        .get('/api/orders/non-existent-order')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${customerToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 200 and order details for own order', async () => {
      jest
        .spyOn(sessionModel, 'findActiveSessionByTokenHash')
        .mockResolvedValueOnce(mockCustomerSession);
      jest.spyOn(checkoutService, 'getOrderById').mockResolvedValueOnce(sampleOrder);

      const response = await request(app())
        .get(`/api/orders/${sampleOrder.id}`)
        .set('Cookie', `${SESSION_COOKIE_NAME}=${customerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.order.id).toBe(sampleOrder.id);
    });
  });
});

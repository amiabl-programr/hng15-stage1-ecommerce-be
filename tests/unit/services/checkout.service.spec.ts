import { jest } from '@jest/globals';

import { checkoutService } from '../../../src/services/checkout.service.ts';
import { orderModel, type OrderWithItems } from '../../../src/models/order.model.ts';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../../src/lib/errors.ts';
import type { CreateOrderRequest } from '../../../src/contracts/schemas/checkout.ts';

const mockOrderRow: OrderWithItems = {
  id: 'order-uuid-1',
  order_number: 'RC-1001',
  profile_id: 'cust-uuid-1',
  status: 'pending',
  payment_status: 'pending',
  payment_method: 'transfer',
  customer_name: 'John Doe',
  customer_email: 'john@example.com',
  customer_phone: '08012345678',
  delivery_address: {
    streetAddress: '10 Victoria Island',
    city: 'Lagos',
    state: 'Lagos',
    additionalInstructions: 'Call before delivery',
  },
  subtotal: 100000,
  delivery_fee: 15000,
  total_amount: 115000,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  order_items: [
    {
      id: 'item-uuid-1',
      order_id: 'order-uuid-1',
      product_id: 'prod-uuid-1',
      variant_id: 'var-uuid-1',
      product_name: 'Aluminium Longspan',
      unit_price: 50000,
      quantity: 2,
      line_total: 100000,
      custom_specs: { lengthMetres: 4 },
      created_at: new Date().toISOString(),
    },
  ],
};

const sampleCreateOrderRequest: CreateOrderRequest = {
  customer: {
    fullName: 'John Doe',
    email: 'john@example.com',
    phone: '08012345678',
    streetAddress: '10 Victoria Island',
    city: 'Lagos',
    state: 'Lagos',
    additionalInstructions: 'Call before delivery',
    paymentMethod: 'transfer',
  },
  items: [
    {
      productId: '11111111-1111-4111-8111-111111111111',
      variantId: '22222222-2222-4222-8222-222222222222',
      quantity: 2,
      customSpecs: { lengthMetres: 4 },
    },
  ],
};

describe('checkout service', () => {
  describe('createOrder', () => {
    it('creates order via RPC and returns mapped Order contract shape', async () => {
      jest.spyOn(orderModel, 'createOrderRpc').mockResolvedValueOnce(mockOrderRow);
      jest
        .spyOn(orderModel, 'findOrderWithItemsById')
        .mockResolvedValueOnce(mockOrderRow);

      const result = await checkoutService.createOrder(
        sampleCreateOrderRequest,
        'cust-uuid-1',
      );

      expect(orderModel.createOrderRpc).toHaveBeenCalledWith(
        'cust-uuid-1',
        sampleCreateOrderRequest.customer,
        sampleCreateOrderRequest.items,
      );
      expect(result.id).toBe('order-uuid-1');
      expect(result.orderNumber).toBe('RC-1001');
      expect(result.subtotal).toBe(100000);
      expect(result.deliveryFee).toBe(15000);
      expect(result.total).toBe(115000);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getOrderById', () => {
    it('throws UnauthorizedError when user is missing', async () => {
      await expect(
        checkoutService.getOrderById('order-uuid-1', null),
      ).rejects.toThrow(UnauthorizedError);
    });

    it('throws NotFoundError when order does not exist', async () => {
      jest.spyOn(orderModel, 'findOrderWithItemsById').mockResolvedValueOnce(null);

      await expect(
        checkoutService.getOrderById('non-existent', { id: 'cust-uuid-1', role: 'customer' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError when customer tries to access another customer order', async () => {
      jest
        .spyOn(orderModel, 'findOrderWithItemsById')
        .mockResolvedValueOnce(mockOrderRow); // profile_id is 'cust-uuid-1'

      await expect(
        checkoutService.getOrderById('order-uuid-1', {
          id: 'different-cust-id',
          role: 'customer',
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('returns order when customer accesses own order', async () => {
      jest
        .spyOn(orderModel, 'findOrderWithItemsById')
        .mockResolvedValueOnce(mockOrderRow);

      const order = await checkoutService.getOrderById('order-uuid-1', {
        id: 'cust-uuid-1',
        role: 'customer',
      });

      expect(order.id).toBe('order-uuid-1');
      expect(order.customerEmail).toBe('john@example.com');
    });

    it('returns order when admin accesses another customer order', async () => {
      jest
        .spyOn(orderModel, 'findOrderWithItemsById')
        .mockResolvedValueOnce(mockOrderRow);

      const order = await checkoutService.getOrderById('order-uuid-1', {
        id: 'admin-id',
        role: 'admin',
      });

      expect(order.id).toBe('order-uuid-1');
    });
  });

  describe('listOrders', () => {
    it('restricts customer queries to their own profileId', async () => {
      const listSpy = jest
        .spyOn(orderModel, 'listOrdersWithItems')
        .mockResolvedValueOnce([mockOrderRow]);

      const result = await checkoutService.listOrders(
        { limit: 10 },
        { id: 'cust-uuid-1', role: 'customer' },
      );

      expect(listSpy).toHaveBeenCalledWith({
        profileId: 'cust-uuid-1',
        status: undefined,
        cursor: undefined,
        limit: 10,
      });
      expect(result.items).toHaveLength(1);
    });

    it('allows admin queries across all profiles with status filter', async () => {
      const listSpy = jest
        .spyOn(orderModel, 'listOrdersWithItems')
        .mockResolvedValueOnce([mockOrderRow]);

      const result = await checkoutService.listOrders(
        { limit: 10, status: 'pending' },
        { id: 'admin-id', role: 'admin' },
      );

      expect(listSpy).toHaveBeenCalledWith({
        profileId: undefined,
        status: 'pending',
        cursor: undefined,
        limit: 10,
      });
      expect(result.items).toHaveLength(1);
    });
  });
});

import type {
  CreateOrderRequest,
  CustomSpecs,
  Order,
  OrderItem,
} from '../contracts/schemas/checkout.ts';
import type { OrderStatus } from '../contracts/schemas/common.ts';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../lib/errors.ts';
import {
  decodeCursor,
  encodeCursor,
} from './catalog.service.ts';
import {
  orderModel,
  type OrderItemRow,
  type OrderWithItems,
} from '../models/order.model.ts';
import { outboxModel } from '../models/outbox.model.ts';
import {
  getOrderConfirmationSubject,
  renderOrderConfirmationHtml,
} from '../providers/mail/templates/order-confirmation.ts';
import { logger } from '../lib/logger.ts';

export function mapToOrderItem(item: OrderItemRow): OrderItem {
  let customSpecs: CustomSpecs | null = null;
  if (
    item.custom_specs &&
    typeof item.custom_specs === 'object' &&
    !Array.isArray(item.custom_specs)
  ) {
    customSpecs = item.custom_specs as CustomSpecs;
  }

  return {
    id: item.id,
    productId: item.product_id ?? '',
    variantId: item.variant_id ?? null,
    productName: item.product_name,
    unitPrice: Number(item.unit_price),
    quantity: item.quantity,
    lineTotal: Number(item.line_total),
    customSpecs,
  };
}

export function mapToOrder(row: OrderWithItems): Order {
  const address =
    row.delivery_address &&
    typeof row.delivery_address === 'object' &&
    !Array.isArray(row.delivery_address)
      ? (row.delivery_address as Record<string, unknown>)
      : {};

  const additionalInstructions =
    address.additionalInstructions ?? address.additional_instructions;

  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    deliveryAddress: {
      streetAddress: String(address.streetAddress ?? address.street_address ?? ''),
      city: String(address.city ?? ''),
      state: String(address.state ?? ''),
      additionalInstructions: additionalInstructions ? String(additionalInstructions) : null,
    },
    items: (row.order_items || []).map(mapToOrderItem),
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total_amount),
    notes: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createOrder(
  request: CreateOrderRequest,
  profileId: string,
): Promise<Order> {
  // Call create_order RPC which handles pricing, stock checks, sequence and email outbox
  const created = await orderModel.createOrderRpc(
    profileId,
    request.customer,
    request.items,
  );

  const fullOrder = await orderModel.findOrderWithItemsById(created.id);
  if (!fullOrder) {
    throw new NotFoundError('Order created but could not be retrieved');
  }

  const order = mapToOrder(fullOrder);

  logger.info('order placed successfully', {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerEmail: order.customerEmail,
    itemCount: order.items.length,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    total: order.total,
  });

  // Queue order confirmation email via transactional outbox
  try {
    const subject = getOrderConfirmationSubject(order.orderNumber);
    const html = renderOrderConfirmationHtml(order);

    await outboxModel.insertOutboxMessage({
      template: 'order-confirmation',
      to_email: order.customerEmail,
      subject,
      html_body: html,
      order_id: order.id,
    });

    logger.info('order confirmation queued in outbox', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      to: order.customerEmail,
    });
  } catch (err) {
    logger.error('failed to queue order confirmation email in outbox', {
      orderId: order.id,
      err: String(err),
    });
  }

  return order;
}

export interface UserContext {
  id: string;
  role: 'customer' | 'admin';
}

export async function getOrderById(
  orderId: string,
  user: UserContext | null | undefined,
): Promise<Order> {
  if (!user) {
    throw new UnauthorizedError('Authentication required');
  }

  const order = await orderModel.findOrderWithItemsById(orderId);
  if (!order) {
    throw new NotFoundError(`Order with id '${orderId}' not found`);
  }

  // Non-admin customers cannot view other customers' orders
  if (user.role !== 'admin' && order.profile_id !== user.id) {
    throw new ForbiddenError('You do not have permission to view this order');
  }

  return mapToOrder(order);
}

export interface ListOrdersQuery {
  cursor?: string | undefined;
  limit?: number | undefined;
  status?: OrderStatus | undefined;
}

export async function listOrders(
  query: ListOrdersQuery,
  user: UserContext | null | undefined,
): Promise<{ items: Order[]; nextCursor: string | null }> {
  if (!user) {
    throw new UnauthorizedError('Authentication required');
  }

  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
  const limit = query.limit ?? 20;

  const profileId = user.role === 'admin' ? undefined : user.id;
  const status = user.role === 'admin' ? query.status : undefined;

  const rows = await orderModel.listOrdersWithItems({
    profileId,
    status,
    cursor,
    limit,
  });

  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  if (hasNextPage && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1]!;
    nextCursor = encodeCursor({ createdAt: last.created_at, id: last.id });
  }

  return {
    items: pageRows.map(mapToOrder),
    nextCursor,
  };
}

export const checkoutService = {
  createOrder,
  getOrderById,
  listOrders,
};

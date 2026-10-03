import { db } from '../config/supabase.ts';
import type { Database, Json } from '../config/database.types.ts';
import { InsufficientStockError, InternalError, ValidationError } from '../lib/errors.ts';

export type OrderStatus = Database['public']['Enums']['order_status'];
export type OrderRow = Database['public']['Tables']['orders']['Row'];
export type OrderItemRow = Database['public']['Tables']['order_items']['Row'];
export type OrderWithItems = OrderRow & { order_items: OrderItemRow[] };

export interface ListOrdersOptions {
  profileId?: string | undefined;
  status?: OrderStatus | undefined;
  cursor?: { createdAt: string; id: string } | undefined;
  limit: number;
}

export async function createOrderRpc(
  profileId: string | null,
  customer: Json,
  items: Json,
): Promise<OrderRow> {
  const { data, error } = await db.rpc('create_order', {
    p_profile_id: profileId,
    p_customer: customer,
    p_items: items,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('INSUFFICIENT_STOCK') || msg.toLowerCase().includes('insufficient stock')) {
      throw new InsufficientStockError(msg);
    }
    if (msg.includes('min_order_quantity') || msg.includes('inactive') || msg.includes('invalid')) {
      throw new ValidationError(msg);
    }
    throw new InternalError(error, `Failed to create order: ${msg}`);
  }

  return data as unknown as OrderRow;
}

export async function findOrderWithItemsById(orderId: string): Promise<OrderWithItems | null> {
  const { data: order, error: orderError } = await db
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (orderError) {
    throw new InternalError(orderError);
  }
  if (!order) return null;

  const { data: items, error: itemsError } = await db
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);

  if (itemsError) {
    throw new InternalError(itemsError);
  }

  return {
    ...(order as OrderRow),
    order_items: (items as OrderItemRow[]) ?? [],
  };
}

export async function listOrdersWithItems(
  options: ListOrdersOptions,
): Promise<OrderWithItems[]> {
  let query = db
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(options.limit + 1);

  if (options.profileId) {
    query = query.eq('profile_id', options.profileId);
  }

  if (options.status) {
    query = query.eq('status', options.status);
  }

  if (options.cursor) {
    query = query.or(
      `created_at.lt.${options.cursor.createdAt},and(created_at.eq.${options.cursor.createdAt},id.lt.${options.cursor.id})`,
    );
  }

  const { data: orderRows, error: orderError } = await query;

  if (orderError) {
    throw new InternalError(orderError);
  }

  const orders = (orderRows as OrderRow[]) ?? [];
  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const { data: items, error: itemsError } = await db
    .from('order_items')
    .select('*')
    .in('order_id', orderIds);

  if (itemsError) {
    throw new InternalError(itemsError);
  }

  const itemRows = (items as OrderItemRow[]) ?? [];

  return orders.map((order) => ({
    ...order,
    order_items: itemRows.filter((item) => item.order_id === order.id),
  }));
}

export async function findRecentOrdersByProfileId(
  profileId: string,
  limit = 5,
): Promise<OrderRow[]> {
  const { data, error } = await db
    .from('orders')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new InternalError(error);
  }

  return (data as OrderRow[]) ?? [];
}

export const orderModel = {
  createOrderRpc,
  findOrderWithItemsById,
  listOrdersWithItems,
  findRecentOrdersByProfileId,
};

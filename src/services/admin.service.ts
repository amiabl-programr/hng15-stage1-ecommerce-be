import { db } from '../config/supabase.ts';
import type {
  CustomerRowSchema,
  UpdateInventoryInput,
  UpdateOrderStatusInput,
  UpsertCategoryInput,
  UpsertProductInput,
} from '../contracts/schemas/admin.ts';
import type { z } from 'zod';
import { NotFoundError } from '../lib/errors.ts';
import { auditModel } from '../models/audit.model.ts';
import { orderModel } from '../models/order.model.ts';
import { outboxModel } from '../models/outbox.model.ts';
import {
  getOrderStatusSubject,
  renderOrderStatusHtml,
} from '../providers/mail/templates/order-status.ts';
import { mapToOrder } from './checkout.service.ts';
import { decodeCursor, encodeCursor } from './catalog.service.ts';

export type CustomerRow = z.infer<typeof CustomerRowSchema>;

export async function createProduct(
  input: UpsertProductInput,
  actorId?: string | undefined,
  ip?: string | undefined,
) {
  const { data: created, error } = await db
    .from('products')
    .insert({
      name: input.name,
      slug: input.slug,
      description: input.description || '',
      base_price: input.basePrice,
      min_order_quantity: input.minOrderQuantity,
      is_active: input.isActive ?? true,
      product_type: input.productType,
      unit_type: input.unitType,
      profile_kind: input.profileKind,
      category_id: input.categoryId ?? null,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  await auditModel.insertAuditLog({
    actor_id: actorId ?? null,
    action: 'product.created',
    entity_type: 'products',
    entity_id: created.id,
    before: null,
    after: created,
    ip: ip ?? null,
  });

  return created;
}

export async function createCategory(
  input: UpsertCategoryInput,
  actorId?: string | undefined,
  ip?: string | undefined,
) {
  const { data: created, error } = await db
    .from('categories')
    .insert({
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  await auditModel.insertAuditLog({
    actor_id: actorId ?? null,
    action: 'category.created',
    entity_type: 'categories',
    entity_id: created.id,
    before: null,
    after: created,
    ip: ip ?? null,
  });

  return created;
}

export async function listAdminProducts() {
  const { data, error } = await db
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getAdminProductById(id: string) {
  const { data, error } = await db
    .from('products')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError(`Product with id '${id}' not found`);
  return data;
}

export async function listAdminCategories() {
  const { data, error } = await db
    .from('categories')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function updateOrderStatus(
  orderId: string,
  input: UpdateOrderStatusInput,
  actorId?: string | undefined,
  ip?: string | undefined,
) {
  const existing = await orderModel.findOrderWithItemsById(orderId);
  if (!existing) {
    throw new NotFoundError(`Order with id '${orderId}' not found`);
  }

  const { data: updated, error } = await db
    .from('orders')
    .update({
      status: input.status,
      payment_status: input.paymentStatus ?? existing.payment_status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select('*')
    .single();

  if (error) throw error;

  await auditModel.insertAuditLog({
    actor_id: actorId ?? null,
    action: 'order.status_updated',
    entity_type: 'orders',
    entity_id: orderId,
    before: { status: existing.status, payment_status: existing.payment_status },
    after: { status: updated.status, payment_status: updated.payment_status },
    ip: ip ?? null,
  });

  // Enqueue order status update email
  const subject = getOrderStatusSubject(existing.order_number, input.status);
  const html = renderOrderStatusHtml({
    orderNumber: existing.order_number,
    customerName: existing.customer_name,
    status: input.status,
  });

  await outboxModel
    .insertOutboxMessage({
      template: 'order-status',
      to_email: existing.customer_email,
      subject,
      html_body: html,
      order_id: orderId,
    })
    .catch(() => undefined);

  const fullOrder = await orderModel.findOrderWithItemsById(orderId);
  return mapToOrder(fullOrder!);
}

export async function updateInventoryStock(
  variantId: string,
  input: UpdateInventoryInput,
  actorId?: string | undefined,
  ip?: string | undefined,
) {
  const clampedStock = Math.max(0, input.stockQuantity);

  const { data: existing, error: findError } = await db
    .from('product_variants')
    .select('*')
    .eq('id', variantId)
    .maybeSingle();

  if (findError) throw findError;
  if (!existing) {
    throw new NotFoundError(`Variant with id '${variantId}' not found`);
  }

  const { data: updated, error: updateError } = await db
    .from('product_variants')
    .update({
      stock_quantity: clampedStock,
      updated_at: new Date().toISOString(),
    })
    .eq('id', variantId)
    .select('*')
    .single();

  if (updateError) throw updateError;

  await auditModel.insertAuditLog({
    actor_id: actorId ?? null,
    action: 'inventory.stock_updated',
    entity_type: 'product_variants',
    entity_id: variantId,
    before: { stock_quantity: existing.stock_quantity },
    after: { stock_quantity: clampedStock },
    ip: ip ?? null,
  });

  return {
    variantId,
    stockQuantity: updated.stock_quantity,
  };
}

export async function listInventory(lowStockOnly = false) {
  const { data, error } = await db
    .from('product_variants')
    .select('*')
    .order('stock_quantity', { ascending: true });

  if (error) throw error;
  const items = data ?? [];

  if (lowStockOnly) {
    return items.filter((item) => item.stock_quantity <= 5);
  }

  return items;
}

export async function listCustomers(query: { cursor?: string | undefined; limit: number }) {
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
  const limit = query.limit;

  let profilesQuery = db
    .from('profiles')
    .select('id, full_name, email, created_at')
    .eq('role', 'customer')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    profilesQuery = profilesQuery.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data: profiles, error: pError } = await profilesQuery;
  if (pError) throw pError;

  const profileRows = profiles ?? [];
  const hasNextPage = profileRows.length > limit;
  const pageProfiles = hasNextPage ? profileRows.slice(0, limit) : profileRows;

  let nextCursor: string | null = null;
  if (hasNextPage && pageProfiles.length > 0) {
    const last = pageProfiles[pageProfiles.length - 1]!;
    nextCursor = encodeCursor({ createdAt: last.created_at, id: last.id });
  }

  const profileIds = pageProfiles.map((p) => p.id);
  const { data: ordersData } = profileIds.length > 0
    ? await db.from('orders').select('profile_id, total_amount, status').in('profile_id', profileIds)
    : { data: [] };

  const orders = ordersData ?? [];

  const items: CustomerRow[] = pageProfiles.map((p) => {
    const custOrders = orders.filter((o) => o.profile_id === p.id);
    const orderCount = custOrders.length;
    const totalSpent = custOrders
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + Number(o.total_amount), 0);

    return {
      id: p.id,
      fullName: p.full_name,
      email: p.email,
      phone: null,
      orderCount,
      totalSpent,
      createdAt: p.created_at,
    };
  });

  return { items, nextCursor };
}

export const adminService = {
  createProduct,
  createCategory,
  listAdminProducts,
  getAdminProductById,
  listAdminCategories,
  updateOrderStatus,
  updateInventoryStock,
  listInventory,
  listCustomers,
};

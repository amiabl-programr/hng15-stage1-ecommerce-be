import { db } from '../config/supabase.ts';
import { InternalError } from '../lib/errors.ts';

export interface AdminStats {
  orders: {
    total: number;
    pending: number;
    revenue: number;
  };
  customers: {
    total: number;
  };
  inventory: {
    variants: number;
    lowStock: number;
    outOfStock: number;
  };
  fabricationRequests: {
    new: number;
  };
}

export async function getAdminStats(): Promise<AdminStats> {
  const [ordersRes, profilesRes, variantsRes, fabRes] = await Promise.all([
    db.from('orders').select('status, total_amount'),
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
    db.from('product_variants').select('stock_quantity'),
    db.from('fabrication_requests').select('id', { count: 'exact', head: true }).eq('status', 'new'),
  ]);

  if (ordersRes.error) throw new InternalError(ordersRes.error);
  if (profilesRes.error) throw new InternalError(profilesRes.error);
  if (variantsRes.error) throw new InternalError(variantsRes.error);
  if (fabRes.error) throw new InternalError(fabRes.error);

  const orders = ordersRes.data ?? [];
  const totalOrders = orders.length;
  const pendingOrders = orders.filter(
    (o) => o.status === 'pending' || o.status === 'payment_pending',
  ).length;
  const revenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + Number(o.total_amount), 0);

  const totalCustomers = profilesRes.count ?? 0;

  const variants = variantsRes.data ?? [];
  const totalVariants = variants.length;
  const lowStock = variants.filter((v) => v.stock_quantity <= 5 && v.stock_quantity > 0).length;
  const outOfStock = variants.filter((v) => v.stock_quantity === 0).length;

  const newFabRequests = fabRes.count ?? 0;

  return {
    orders: {
      total: totalOrders,
      pending: pendingOrders,
      revenue,
    },
    customers: {
      total: totalCustomers,
    },
    inventory: {
      variants: totalVariants,
      lowStock,
      outOfStock,
    },
    fabricationRequests: {
      new: newFabRequests,
    },
  };
}

export const statsService = {
  getAdminStats,
};

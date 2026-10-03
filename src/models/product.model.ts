import { db, publicDb } from '../config/supabase.ts';
import type { Database } from '../config/database.types.ts';
import { InternalError } from '../lib/errors.ts';

export type ProductPublicRow = Database['public']['Views']['products_public']['Row'];
export type ProductVariantRow = Database['public']['Tables']['product_variants']['Row'];

export interface ListProductsOptions {
  categoryId?: string | undefined;
  cursor?: { createdAt: string; id: string } | undefined;
  limit: number;
}

export async function listPublicProducts(
  options: ListProductsOptions,
): Promise<ProductPublicRow[]> {
  let query = publicDb
    .from('products_public')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(options.limit + 1);

  if (options.categoryId) {
    query = query.eq('category_id', options.categoryId);
  }

  if (options.cursor) {
    // Keyset pagination: created_at < cursor.createdAt OR (created_at = cursor.createdAt AND id < cursor.id)
    query = query.or(
      `created_at.lt.${options.cursor.createdAt},and(created_at.eq.${options.cursor.createdAt},id.lt.${options.cursor.id})`,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new InternalError(error);
  }

  return (data as ProductPublicRow[]) ?? [];
}

export async function findPublicProductBySlug(
  slug: string,
): Promise<ProductPublicRow | null> {
  const { data, error } = await publicDb
    .from('products_public')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    throw new InternalError(error);
  }

  return (data as ProductPublicRow | null) ?? null;
}

export async function listFeaturedProducts(
  limit = 6,
): Promise<ProductPublicRow[]> {
  const { data, error } = await publicDb
    .from('products_public')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new InternalError(error);
  }

  return (data as ProductPublicRow[]) ?? [];
}

export async function findProductById(
  id: string,
): Promise<Database['public']['Tables']['products']['Row'] | null> {
  const { data, error } = await db
    .from('products')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new InternalError(error);
  }

  return (data as Database['public']['Tables']['products']['Row'] | null) ?? null;
}

export async function findVariantsByProductIds(
  productIds: string[],
): Promise<ProductVariantRow[]> {
  if (productIds.length === 0) return [];

  const { data, error } = await publicDb
    .from('product_variants')
    .select('*')
    .in('product_id', productIds)
    .eq('is_active', true);

  if (error) {
    throw new InternalError(error);
  }

  return (data as ProductVariantRow[]) ?? [];
}

export const productModel = {
  listPublicProducts,
  findPublicProductBySlug,
  listFeaturedProducts,
  findProductById,
  findVariantsByProductIds,
};

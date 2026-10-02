import { publicDb } from '../config/supabase.ts';
import type { Database } from '../config/database.types.ts';
import { InternalError } from '../lib/errors.ts';

export type ProductImagePublicRow = Database['public']['Views']['product_images_public']['Row'];
export type CategoryImagePublicRow = Database['public']['Views']['category_images_public']['Row'];

export async function findPublicImagesByProductIds(
  productIds: string[],
): Promise<ProductImagePublicRow[]> {
  if (productIds.length === 0) return [];

  const { data, error } = await publicDb
    .from('product_images_public')
    .select('*')
    .in('product_id', productIds)
    .order('display_order', { ascending: true });

  if (error) {
    throw new InternalError(error);
  }

  return (data as ProductImagePublicRow[]) ?? [];
}

export async function findPublicImagesByCategoryIds(
  categoryIds: string[],
): Promise<CategoryImagePublicRow[]> {
  if (categoryIds.length === 0) return [];

  const { data, error } = await publicDb
    .from('category_images_public')
    .select('*')
    .in('category_id', categoryIds)
    .order('display_order', { ascending: true });

  if (error) {
    throw new InternalError(error);
  }

  return (data as CategoryImagePublicRow[]) ?? [];
}

export const mediaModel = {
  findPublicImagesByProductIds,
  findPublicImagesByCategoryIds,
};

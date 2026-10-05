import { db } from '../config/supabase.ts';
import type { Database } from '../config/database.types.ts';
import { InternalError } from '../lib/errors.ts';

export type ImageRole = Database['public']['Enums']['image_role'];
export type ProductImagePublicRow = Database['public']['Views']['product_images_public']['Row'];
export type CategoryImagePublicRow = Database['public']['Views']['category_images_public']['Row'];
export type ProductImageRow = Database['public']['Tables']['product_images']['Row'];
export type ProductImageInsert = Database['public']['Tables']['product_images']['Insert'];
export type ProductImageUpdate = Database['public']['Tables']['product_images']['Update'];

export async function findPublicImagesByProductIds(
  productIds: string[],
): Promise<ProductImagePublicRow[]> {
  if (productIds.length === 0) return [];

  const { data, error } = await db.from('product_images')
    .select('*')
    .in('product_id', productIds)
    .is('deleted_at', null)
    .order('display_order', { ascending: true });

  if (error) {
    return [];
  }

  return (data as ProductImagePublicRow[]) ?? [];
}

export async function findPublicImagesByCategoryIds(
  categoryIds: string[],
): Promise<CategoryImagePublicRow[]> {
  if (categoryIds.length === 0) return [];

  const { data, error } = await db.from('category_images')
    .select('*')
    .in('category_id', categoryIds)
    .order('display_order', { ascending: true });

  if (error) {
    return [];
  }

  return (data as CategoryImagePublicRow[]) ?? [];
}

export async function findImageById(id: string): Promise<ProductImageRow | null> {
  const { data, error } = await db
    .from('product_images')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new InternalError(error);
  }

  return (data as ProductImageRow | null) ?? null;
}

export async function findImagesByProductId(productId: string): Promise<ProductImageRow[]> {
  const { data, error } = await db
    .from('product_images')
    .select('*')
    .eq('product_id', productId)
    .order('display_order', { ascending: true });

  if (error) {
    throw new InternalError(error);
  }

  return (data as ProductImageRow[]) ?? [];
}

export interface AttachProductImageParams {
  productId: string;
  storagePath: string;
  altText: string;
  role: ImageRole;
  width: number;
  height: number;
  bytes: number;
  mimeType: string;
  blurhash: string;
  source: string;
  sourceUrl?: string | null;
  license: string;
}

export async function attachProductImage(params: AttachProductImageParams): Promise<ProductImageRow> {
  const { data, error } = await db.rpc('attach_product_image', {
    p_product_id: params.productId,
    p_storage_path: params.storagePath,
    p_alt_text: params.altText,
    p_role: params.role,
    p_width: params.width,
    p_height: params.height,
    p_bytes: params.bytes,
    p_mime_type: params.mimeType,
    p_blurhash: params.blurhash,
    p_source: params.source,
    p_source_url: params.sourceUrl ?? null,
    p_license: params.license,
  });

  if (error) {
    throw new InternalError(error, `Failed to attach product image: ${error.message}`);
  }

  return data as unknown as ProductImageRow;
}

export async function setPrimaryProductImage(imageId: string): Promise<void> {
  const { error } = await db.rpc('set_primary_product_image', {
    p_image_id: imageId,
  });

  if (error) {
    throw new InternalError(error, `Failed to set primary product image: ${error.message}`);
  }
}

export async function removeProductImage(imageId: string): Promise<void> {
  const { error } = await db.rpc('remove_product_image', {
    p_image_id: imageId,
  });

  if (error) {
    throw new InternalError(error, `Failed to remove product image: ${error.message}`);
  }
}

export async function updateProductImage(
  imageId: string,
  patch: ProductImageUpdate,
): Promise<ProductImageRow> {
  const { data, error } = await db
    .from('product_images')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', imageId)
    .select('*')
    .single();

  if (error) {
    throw new InternalError(error, `Failed to update product image: ${error.message}`);
  }

  return data as ProductImageRow;
}

export async function findSoftDeletedImagesOlderThan(cutoffIso: string): Promise<ProductImageRow[]> {
  const { data, error } = await db
    .from('product_images')
    .select('*')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoffIso);

  if (error) {
    throw new InternalError(error);
  }

  return (data as ProductImageRow[]) ?? [];
}

export async function hardDeleteImageRow(imageId: string): Promise<void> {
  const { error } = await db.from('product_images').delete().eq('id', imageId);

  if (error) {
    throw new InternalError(error, `Failed to delete product image row: ${error.message}`);
  }
}

export const mediaModel = {
  findPublicImagesByProductIds,
  findPublicImagesByCategoryIds,
  findImageById,
  findImagesByProductId,
  attachProductImage,
  setPrimaryProductImage,
  removeProductImage,
  updateProductImage,
  findSoftDeletedImagesOlderThan,
  hardDeleteImageRow,
};

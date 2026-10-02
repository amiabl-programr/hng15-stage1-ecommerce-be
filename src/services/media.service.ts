import crypto from 'node:crypto';

import type { AdminImage, UpdateImageInput } from '../contracts/schemas/media.ts';
import { suggestAltText } from '../contracts/schemas/media.ts';
import type { ImageRole, PermissionStatus } from '../contracts/schemas/common.ts';
import { NotFoundError } from '../lib/errors.ts';
import { processImage } from '../lib/image-processing.ts';
import { storageClient } from '../lib/storage.ts';
import { auditModel } from '../models/audit.model.ts';
import { mediaModel, type ProductImageRow } from '../models/media.model.ts';
import { productModel } from '../models/product.model.ts';

export function mapToAdminImage(row: ProductImageRow): AdminImage {
  return {
    id: row.id,
    entityType: 'product',
    entityId: row.product_id,
    storagePath: row.storage_path,
    altText: row.alt_text,
    role: row.role,
    displayOrder: row.display_order,
    isPrimary: row.is_primary,
    permissionStatus: row.permission_status,
    source: row.source || null,
    licence: row.license || null,
    width: row.width ?? 1800,
    height: row.height ?? 1200,
    bytes: row.bytes ?? 0,
    blurhash: row.blurhash ?? '',
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
  };
}

export interface UploadProductImageParams {
  productId: string;
  fileBuffer: Buffer;
  role?: ImageRole | undefined;
  altText?: string | undefined;
  source?: string | undefined;
  sourceUrl?: string | undefined;
  license?: string | undefined;
  uploadedBy?: string | undefined;
}

export async function uploadProductImage(
  params: UploadProductImageParams,
): Promise<{ image: AdminImage; suggestedAlt: string }> {
  // 1. Validate productId exists
  const product = await productModel.findProductById(params.productId);
  if (!product) {
    throw new NotFoundError(`Product with id '${params.productId}' not found`);
  }

  const role: ImageRole = params.role ?? 'detail';
  const suggestedAlt = suggestAltText({
    role,
    productName: product.name,
    profileKind: product.profile_kind,
  });

  const altText = params.altText?.trim() || suggestedAlt;

  // 2. Sniff magic bytes, guard decompression bombs, resize & re-encode WebP, strip EXIF/GPS, compute blurhash
  const processed = await processImage(params.fileBuffer);

  // 3. Generate storage path: products/<productId>/<uuid>.webp
  const fileUuid = crypto.randomUUID();
  const storagePath = `products/${params.productId}/${fileUuid}.webp`;

  // 4. Upload to storage
  await storageClient.uploadProductImage(storagePath, processed.buffer, processed.mimeType);

  // 5. Insert row atomically via attach_product_image RPC
  let imageRow: ProductImageRow;
  try {
    imageRow = await mediaModel.attachProductImage({
      productId: params.productId,
      storagePath,
      altText,
      role,
      width: processed.width,
      height: processed.height,
      bytes: processed.bytes,
      mimeType: processed.mimeType,
      blurhash: processed.blurhash,
      source: params.source ?? 'own',
      sourceUrl: params.sourceUrl ?? null,
      license: params.license ?? 'unknown',
    });
  } catch (dbError) {
    // Prevent orphan bytes in storage if DB attach fails
    await storageClient.deleteProductImage(storagePath).catch(() => {});
    throw dbError;
  }

  return {
    image: mapToAdminImage(imageRow),
    suggestedAlt,
  };
}

export async function listProductImagesForAdmin(productId: string): Promise<AdminImage[]> {
  const product = await productModel.findProductById(productId);
  if (!product) {
    throw new NotFoundError(`Product with id '${productId}' not found`);
  }

  const rows = await mediaModel.findImagesByProductId(productId);
  return rows.map(mapToAdminImage);
}

export async function updateImage(
  imageId: string,
  patch: UpdateImageInput,
): Promise<AdminImage> {
  const existing = await mediaModel.findImageById(imageId);
  if (!existing) {
    throw new NotFoundError(`Image with id '${imageId}' not found`);
  }

  const updated = await mediaModel.updateProductImage(imageId, {
    alt_text: patch.altText,
    role: patch.role,
    display_order: patch.displayOrder,
    source: patch.source,
    license: patch.licence,
  });

  return mapToAdminImage(updated);
}

export async function updateImagePermission(
  imageId: string,
  permissionStatus: PermissionStatus,
  actorId?: string | undefined,
  ip?: string | undefined,
): Promise<AdminImage> {
  const existing = await mediaModel.findImageById(imageId);
  if (!existing) {
    throw new NotFoundError(`Image with id '${imageId}' not found`);
  }

  const updated = await mediaModel.updateProductImage(imageId, {
    permission_status: permissionStatus,
  });

  // Licensing gate transition audit logging
  await auditModel.insertAuditLog({
    actor_id: actorId ?? null,
    action: 'image.permission_updated',
    entity_type: 'product_images',
    entity_id: imageId,
    before: { permission_status: existing.permission_status },
    after: { permission_status: permissionStatus },
    ip: ip ?? null,
  });

  return mapToAdminImage(updated);
}

export async function setPrimaryImage(imageId: string): Promise<void> {
  const existing = await mediaModel.findImageById(imageId);
  if (!existing) {
    throw new NotFoundError(`Image with id '${imageId}' not found`);
  }

  await mediaModel.setPrimaryProductImage(imageId);
}

export async function deleteImage(imageId: string): Promise<void> {
  const existing = await mediaModel.findImageById(imageId);
  if (!existing) {
    throw new NotFoundError(`Image with id '${imageId}' not found`);
  }

  await mediaModel.removeProductImage(imageId);
}

export async function sweepSoftDeletedImages(hours = 24): Promise<{ sweptCount: number }> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const rows = await mediaModel.findSoftDeletedImagesOlderThan(cutoff);

  for (const row of rows) {
    await storageClient.deleteProductImage(row.storage_path).catch(() => {});
    await mediaModel.hardDeleteImageRow(row.id);
  }

  return { sweptCount: rows.length };
}

export const mediaService = {
  uploadProductImage,
  listProductImagesForAdmin,
  updateImage,
  updateImagePermission,
  setPrimaryImage,
  deleteImage,
  sweepSoftDeletedImages,
};

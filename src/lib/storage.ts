import { env } from '../config/env.ts';
import { db } from '../config/supabase.ts';
import { InternalError } from './errors.ts';

/**
 * Supabase Storage client wrapper.
 * Storage paths are namespaced as `products/${productId}/${uuid}.webp`.
 * URLs are never stored in database tables, only derived at read time.
 */

export async function uploadProductImage(
  storagePath: string,
  buffer: Buffer,
  mimeType = 'image/webp',
): Promise<void> {
  const config = env();
  const bucket = config.storageBucket;

  const { error } = await db.storage.from(bucket).upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    throw new InternalError(error, `Failed to upload image to storage: ${error.message}`);
  }
}

export async function deleteProductImage(storagePath: string): Promise<void> {
  await deleteProductImages([storagePath]);
}

export async function deleteProductImages(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return;

  const config = env();
  const bucket = config.storageBucket;

  const { error } = await db.storage.from(bucket).remove(storagePaths);

  if (error) {
    throw new InternalError(error, `Failed to delete image(s) from storage: ${error.message}`);
  }
}

export const storageClient = {
  uploadProductImage,
  deleteProductImage,
  deleteProductImages,
};

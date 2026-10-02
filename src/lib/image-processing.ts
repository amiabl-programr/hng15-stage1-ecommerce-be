import { encode } from 'blurhash';
import sharp, { type Metadata } from 'sharp';

import { UnsupportedMediaTypeError, ValidationError } from './errors.ts';

export interface ProcessedImage {
  readonly buffer: Buffer;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly mimeType: 'image/webp';
  readonly blurhash: string;
}

export type SupportedMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * Sniffs the magic bytes of a buffer.
 * Rejects client-supplied Content-Type headers when bytes do not match.
 */
export function sniffImageMagicBytes(buffer: Buffer): SupportedMimeType {
  if (buffer.length < 12) {
    throw new UnsupportedMediaTypeError('File is too small to be a valid image');
  }

  // JPEG: 0xFF 0xD8 0xFF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: RIFF....WEBP
  const isRiff =
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
  const isWebp =
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;

  if (isRiff && isWebp) {
    return 'image/webp';
  }

  throw new UnsupportedMediaTypeError(
    'Unsupported image format. Only JPEG, PNG, and WebP images are allowed.',
  );
}

const MAX_DIMENSION_PX = 4000;
const MAX_PIXELS = 16_000_000; // 16 Megapixels decompression bomb guard

/**
 * Validates, strips metadata/EXIF/GPS, resizes and encodes image to WebP (quality 82).
 * Computes dimensions and blurhash placeholder.
 */
export async function processImage(inputBuffer: Buffer): Promise<ProcessedImage> {
  // 1. Sniff magic bytes
  sniffImageMagicBytes(inputBuffer);

  // 2. Decode metadata with decompression bomb check
  let metadata: Metadata;
  try {
    metadata = await sharp(inputBuffer, { failOn: 'error' }).metadata();
  } catch (err) {
    throw new UnsupportedMediaTypeError(
      err instanceof Error ? `Corrupt image data: ${err.message}` : 'Corrupt image data',
    );
  }

  const { width, height } = metadata;
  if (!width || !height) {
    throw new UnsupportedMediaTypeError('Unable to determine image dimensions');
  }

  if (width > MAX_DIMENSION_PX || height > MAX_DIMENSION_PX || width * height > MAX_PIXELS) {
    throw new ValidationError(
      `Image dimensions (${width}x${height}) exceed allowable limits (max ${MAX_DIMENSION_PX}px or 16MP)`,
    );
  }

  // 3. Re-encode to WebP quality 82, longest edge capped at 2000px, EXIF/GPS stripped (withMetadata not called)
  let processedBuffer: Buffer;
  try {
    processedBuffer = await sharp(inputBuffer, { failOn: 'error' })
      .rotate() // auto-orient based on EXIF before stripping metadata
      .resize({
        width: 2000,
        height: 2000,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (err) {
    throw new UnsupportedMediaTypeError(
      err instanceof Error ? `Failed to process image: ${err.message}` : 'Failed to process image',
    );
  }

  const processedMeta = await sharp(processedBuffer).metadata();
  const finalWidth = processedMeta.width ?? width;
  const finalHeight = processedMeta.height ?? height;

  // 4. Generate blurhash from a 32x32 thumbnail representation
  let blurhashString: string;
  try {
    const { data: rawRgba, info } = await sharp(processedBuffer)
      .resize(32, 32, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    blurhashString = encode(
      new Uint8ClampedArray(rawRgba),
      info.width,
      info.height,
      4,
      3,
    );
  } catch {
    blurhashString = '';
  }

  return {
    buffer: processedBuffer,
    width: finalWidth,
    height: finalHeight,
    bytes: processedBuffer.length,
    mimeType: 'image/webp',
    blurhash: blurhashString,
  };
}

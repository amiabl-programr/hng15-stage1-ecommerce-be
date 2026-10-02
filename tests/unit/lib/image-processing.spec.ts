import sharp from 'sharp';

import {
  processImage,
  sniffImageMagicBytes,
} from '../../../src/lib/image-processing.ts';
import { UnsupportedMediaTypeError, ValidationError } from '../../../src/lib/errors.ts';

describe('image-processing', () => {
  describe('sniffImageMagicBytes', () => {
    it('detects JPEG magic bytes (0xFF, 0xD8, 0xFF)', async () => {
      const jpegBuffer = await sharp({
        create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } },
      })
        .jpeg()
        .toBuffer();

      expect(sniffImageMagicBytes(jpegBuffer)).toBe('image/jpeg');
    });

    it('detects PNG magic bytes', async () => {
      const pngBuffer = await sharp({
        create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } },
      })
        .png()
        .toBuffer();

      expect(sniffImageMagicBytes(pngBuffer)).toBe('image/png');
    });

    it('detects WebP magic bytes', async () => {
      const webpBuffer = await sharp({
        create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 0, b: 255 } },
      })
        .webp()
        .toBuffer();

      expect(sniffImageMagicBytes(webpBuffer)).toBe('image/webp');
    });

    it('rejects text or fake binary masquerading as image with 415', () => {
      const textBuffer = Buffer.from('this is not an image but plain text');
      expect(() => sniffImageMagicBytes(textBuffer)).toThrow(UnsupportedMediaTypeError);
    });

    it('rejects too small buffer (< 12 bytes)', () => {
      const tinyBuffer = Buffer.from([0xff, 0xd8, 0xff]);
      expect(() => sniffImageMagicBytes(tinyBuffer)).toThrow(UnsupportedMediaTypeError);
    });
  });

  describe('processImage', () => {
    it('processes a valid JPEG, strips EXIF/GPS, resizes and returns WebP with blurhash', async () => {
      // Create a 2500x1500 JPEG with metadata
      const inputBuffer = await sharp({
        create: { width: 2500, height: 1500, channels: 3, background: { r: 120, g: 100, b: 200 } },
      })
        .withMetadata({
          exif: {
            IFD0: {
              Make: 'TestCamera',
            },
          },
        })
        .jpeg()
        .toBuffer();

      const result = await processImage(inputBuffer);

      expect(result.mimeType).toBe('image/webp');
      expect(result.width).toBeLessThanOrEqual(2000);
      expect(result.height).toBeLessThanOrEqual(2000);
      expect(result.width).toBe(2000);
      expect(result.height).toBe(1200); // aspect ratio preserved: 2500x1500 -> 2000x1200
      expect(result.bytes).toBe(result.buffer.length);
      expect(result.blurhash).toBeTruthy();

      // Verify no GPS/EXIF survived
      const processedMeta = await sharp(result.buffer).metadata();
      expect(processedMeta.format).toBe('webp');
      expect(processedMeta.exif).toBeUndefined();
    });

    it('rejects decompression bomb exceeding dimension or pixel limits', async () => {
      // 4500x1000 exceeds 4000px limit
      const hugeBuffer = await sharp({
        create: { width: 4500, height: 1000, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .png()
        .toBuffer();

      await expect(processImage(hugeBuffer)).rejects.toThrow(ValidationError);
    });

    it('rejects corrupt image data with 415 UnsupportedMediaTypeError', async () => {
      // PNG header followed by garbage
      const corruptBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x99, 0x88, 0x77,
      ]);

      await expect(processImage(corruptBuffer)).rejects.toThrow(UnsupportedMediaTypeError);
    });
  });
});

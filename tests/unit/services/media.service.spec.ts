import { jest } from '@jest/globals';
import sharp from 'sharp';

import { mediaService } from '../../../src/services/media.service.ts';
import { mediaModel, type ProductImageRow } from '../../../src/models/media.model.ts';
import { productModel } from '../../../src/models/product.model.ts';
import { auditModel } from '../../../src/models/audit.model.ts';
import { storageClient } from '../../../src/lib/storage.ts';
import { NotFoundError } from '../../../src/lib/errors.ts';

const mockProduct = {
  id: '22222222-2222-4222-8222-222222222222',
  category_id: 'cat-1',
  name: 'Longspan Sheet',
  slug: 'longspan-sheet',
  description: 'Durable sheet',
  base_price: 5000,
  min_order_quantity: 1,
  is_active: true,
  product_type: 'dimensioned' as const,
  unit_type: 'metre' as const,
  profile_kind: 'longspan' as const,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockProductImageRow: ProductImageRow = {
  id: '11111111-1111-4111-8111-111111111111',
  product_id: mockProduct.id,
  storage_path: `products/${mockProduct.id}/img-1.webp`,
  alt_text: 'Photograph of Longspan Sheet',
  role: 'main',
  width: 1800,
  height: 1200,
  bytes: 40000,
  mime_type: 'image/webp',
  blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
  source: 'own',
  source_url: null,
  license: 'unknown',
  permission_status: 'pending',
  display_order: 1,
  is_primary: true,
  uploaded_by: 'admin-1',
  deleted_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('media service', () => {
  let samplePngBuffer: Buffer;

  beforeAll(async () => {
    samplePngBuffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 50, g: 150, b: 250 } },
    })
      .png()
      .toBuffer();
  });

  describe('uploadProductImage', () => {
    it('throws NotFoundError when productId does not exist', async () => {
      jest.spyOn(productModel, 'findProductById').mockResolvedValueOnce(null);

      await expect(
        mediaService.uploadProductImage({
          productId: 'non-existent-id',
          fileBuffer: samplePngBuffer,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('processes image, uploads to storage, and attaches to database', async () => {
      jest.spyOn(productModel, 'findProductById').mockResolvedValueOnce(mockProduct);
      const storageUploadSpy = jest
        .spyOn(storageClient, 'uploadProductImage')
        .mockResolvedValueOnce();
      const attachSpy = jest
        .spyOn(mediaModel, 'attachProductImage')
        .mockResolvedValueOnce(mockProductImageRow);

      const result = await mediaService.uploadProductImage({
        productId: mockProduct.id,
        fileBuffer: samplePngBuffer,
        role: 'main',
      });

      expect(storageUploadSpy).toHaveBeenCalledTimes(1);
      expect(attachSpy).toHaveBeenCalledTimes(1);
      expect(result.image.id).toBe(mockProductImageRow.id);
      expect(result.suggestedAlt).toBe('Photograph of Longspan Sheet');
    });

    it('cleans up storage object if attachProductImage fails to prevent orphaned bytes', async () => {
      jest.spyOn(productModel, 'findProductById').mockResolvedValueOnce(mockProduct);
      jest.spyOn(storageClient, 'uploadProductImage').mockResolvedValueOnce();
      const storageDeleteSpy = jest
        .spyOn(storageClient, 'deleteProductImage')
        .mockResolvedValueOnce();
      jest
        .spyOn(mediaModel, 'attachProductImage')
        .mockRejectedValueOnce(new Error('Database error'));

      await expect(
        mediaService.uploadProductImage({
          productId: mockProduct.id,
          fileBuffer: samplePngBuffer,
        }),
      ).rejects.toThrow('Database error');

      expect(storageDeleteSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateImagePermission', () => {
    it('updates permission and logs audit entry with before/after state', async () => {
      jest.spyOn(mediaModel, 'findImageById').mockResolvedValueOnce(mockProductImageRow);
      const updateSpy = jest.spyOn(mediaModel, 'updateProductImage').mockResolvedValueOnce({
        ...mockProductImageRow,
        permission_status: 'approved',
      });
      const auditSpy = jest.spyOn(auditModel, 'insertAuditLog').mockResolvedValueOnce();

      const result = await mediaService.updateImagePermission(
        mockProductImageRow.id,
        'approved',
        'admin-user-id',
        '127.0.0.1',
      );

      expect(updateSpy).toHaveBeenCalledWith(mockProductImageRow.id, {
        permission_status: 'approved',
      });
      expect(auditSpy).toHaveBeenCalledWith({
        actor_id: 'admin-user-id',
        action: 'image.permission_updated',
        entity_type: 'product_images',
        entity_id: mockProductImageRow.id,
        before: { permission_status: 'pending' },
        after: { permission_status: 'approved' },
        ip: '127.0.0.1',
      });
      expect(result.permissionStatus).toBe('approved');
    });
  });

  describe('sweepSoftDeletedImages', () => {
    it('deletes storage files and hard deletes database rows for images soft-deleted > 24h ago', async () => {
      const softDeletedRow: ProductImageRow = {
        ...mockProductImageRow,
        id: 'deleted-img-1',
        storage_path: 'products/p1/old.webp',
        deleted_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      };

      jest
        .spyOn(mediaModel, 'findSoftDeletedImagesOlderThan')
        .mockResolvedValueOnce([softDeletedRow]);
      const storageDeleteSpy = jest
        .spyOn(storageClient, 'deleteProductImage')
        .mockResolvedValueOnce();
      const hardDeleteSpy = jest
        .spyOn(mediaModel, 'hardDeleteImageRow')
        .mockResolvedValueOnce();

      const result = await mediaService.sweepSoftDeletedImages(24);

      expect(storageDeleteSpy).toHaveBeenCalledWith('products/p1/old.webp');
      expect(hardDeleteSpy).toHaveBeenCalledWith('deleted-img-1');
      expect(result.sweptCount).toBe(1);
    });
  });
});

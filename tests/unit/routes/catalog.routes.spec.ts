import { jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../../src/app.ts';
import { catalogService } from '../../../src/services/catalog.service.ts';
import { ProductBySlugSchema } from '../../../src/contracts/schemas/catalog.ts';
import type { Category, Product } from '../../../src/contracts/schemas/catalog.ts';

function app() {
  return createApp();
}

const sampleCategory: Category = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Roofing Sheets',
  slug: 'roofing-sheets',
  description: 'Premium aluminium and stone-coated roofing sheets',
  media: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      url: 'https://project.supabase.co/storage/v1/object/public/products/cat.webp',
      alt: 'Roofing Sheets category image',
      role: 'main',
      width: 1800,
      height: 1200,
      blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
      isPrimary: true,
    },
  ],
};

const sampleProduct: Product = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Longspan Aluminium Roofing Sheet',
  slug: 'longspan-aluminium-sheet',
  description: 'Durable 0.55mm aluminium roofing sheets',
  profileKind: 'longspan',
  productType: 'dimensioned',
  unitType: 'metre',
  basePrice: 7500,
  minOrderQuantity: 1,
  isActive: true,
  category: sampleCategory,
  media: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      url: 'https://project.supabase.co/storage/v1/object/public/products/prod.webp',
      alt: 'Photograph of Longspan Aluminium Roofing Sheet',
      role: 'main',
      width: 1800,
      height: 1200,
      blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
      isPrimary: true,
    },
  ],
};

describe('catalog routes', () => {
  describe('GET /api/categories', () => {
    it('returns list of public categories', async () => {
      jest.spyOn(catalogService, 'listCategories').mockResolvedValueOnce([sampleCategory]);

      const response = await request(app()).get('/api/categories');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        items: [sampleCategory],
      });
    });
  });

  describe('GET /api/products', () => {
    it('returns list of public products with pagination', async () => {
      jest.spyOn(catalogService, 'listProducts').mockResolvedValueOnce({
        items: [sampleProduct],
        nextCursor: 'next-page-cursor',
      });

      const response = await request(app()).get('/api/products?limit=10');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.nextCursor).toBe('next-page-cursor');
    });

    it('rejects invalid cursor with 400 status and fields array', async () => {
      const response = await request(app()).get('/api/products?cursor=invalid_base64_json_here');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.fields).toEqual([
        { path: 'cursor', message: 'malformed cursor' },
      ]);
    });
  });

  describe('GET /api/products/featured', () => {
    it('returns featured products list', async () => {
      jest.spyOn(catalogService, 'getFeaturedProducts').mockResolvedValueOnce([sampleProduct]);

      const response = await request(app()).get('/api/products/featured');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        items: [sampleProduct],
      });
    });
  });

  describe('GET /api/products/:slug', () => {
    it('returns product details validated by contract schema', async () => {
      jest.spyOn(catalogService, 'getProductBySlug').mockResolvedValueOnce(sampleProduct);

      const response = await request(app()).get('/api/products/longspan-aluminium-sheet');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Contract test: validates against Phase 2 ProductBySlugSchema
      const validated = ProductBySlugSchema.safeParse(response.body);
      expect(validated.success).toBe(true);
    });

    it('returns 404 NOT_FOUND for unknown product slug', async () => {
      const response = await request(app()).get('/api/products/unknown-slug-not-exists');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});

import { z } from 'zod';

import {
  ImageRoleSchema,
  MoneySchema,
  ProductTypeSchema,
  ProfileKindSchema,
  SlugSchema,
  UnitTypeSchema,
  UuidSchema,
} from './common.ts';

/**
 * Public catalogue reads. Products carry `media` pre-assembled with an absolute `url`,
 * so the frontend never touches a storage path or builds a URL — notes.md §7.
 */

export const MediaAssetSchema = z.object({
  id: UuidSchema,
  url: z.url(),
  alt: z.string().min(1),
  role: ImageRoleSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  blurhash: z.string(),
  isPrimary: z.boolean(),
});
export type MediaAsset = z.infer<typeof MediaAssetSchema>;

export const CategorySchema = z.object({
  id: UuidSchema,
  name: z.string().min(1),
  slug: SlugSchema,
  description: z.string().nullable(),
  media: z.array(MediaAssetSchema),
});
export type Category = z.infer<typeof CategorySchema>;

export const ProductSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1),
  slug: SlugSchema,
  description: z.string().nullable(),
  profileKind: ProfileKindSchema,
  productType: ProductTypeSchema,
  unitType: UnitTypeSchema,
  basePrice: MoneySchema,
  minOrderQuantity: z.int().positive(),
  isActive: z.boolean(),
  category: CategorySchema.nullable(),
  media: z.array(MediaAssetSchema),
});
export type Product = z.infer<typeof ProductSchema>;

export const ProductListQuerySchema = z.object({
  category: SlugSchema.optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ProductListQuery = z.infer<typeof ProductListQuerySchema>;

export const ProductListSchema = z.object({
  success: z.literal(true),
  items: z.array(ProductSchema),
  nextCursor: z.string().nullable(),
});
export type ProductList = z.infer<typeof ProductListSchema>;

export const CategoryListSchema = z.object({
  success: z.literal(true),
  items: z.array(CategorySchema),
});

export const ProductBySlugSchema = z.object({
  success: z.literal(true),
  product: ProductSchema,
});

export const FeaturedListSchema = z.object({
  success: z.literal(true),
  items: z.array(ProductSchema),
});
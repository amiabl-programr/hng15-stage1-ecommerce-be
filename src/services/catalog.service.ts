import { env } from '../config/env.ts';
import type { Category, MediaAsset, Product, ProductListQuery } from '../contracts/schemas/catalog.ts';
import { NotFoundError, ValidationError } from '../lib/errors.ts';
import { categoryModel, type CategoryRow } from '../models/category.model.ts';
import { mediaModel, type CategoryImagePublicRow, type ProductImagePublicRow } from '../models/media.model.ts';
import { productModel, type ProductPublicRow } from '../models/product.model.ts';

export interface KeysetCursor {
  createdAt: string;
  id: string;
}

export function resolveImageUrl(storagePath: string): string {
  if (!storagePath) return '';
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
    return storagePath;
  }
  const config = env();
  return `${config.supabaseUrl.origin}/storage/v1/object/public/${config.storageBucket}/${storagePath}`;
}

export function getSuggestedAlt(role: string, productName: string, profileKind: string): string {
  return role === 'profile'
    ? `Cross-section diagram of the ${profileKind} rib profile`
    : `Photograph of ${productName}`;
}

export function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(encoded: string): KeysetCursor {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as { createdAt?: unknown; id?: unknown };
    if (!parsed || typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      throw new ValidationError('Invalid cursor format', [{ path: 'cursor', message: 'malformed cursor' }]);
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('Invalid cursor format', [{ path: 'cursor', message: 'malformed cursor' }]);
  }
}

function mapProductMedia(
  image: ProductImagePublicRow,
  productName: string,
  profileKind: string,
): MediaAsset {
  return {
    id: image.id,
    url: resolveImageUrl(image.storage_path),
    alt: image.alt_text || getSuggestedAlt(image.role, productName, profileKind),
    role: image.role,
    width: image.width ?? 1800,
    height: image.height ?? 1200,
    blurhash: image.blurhash ?? '',
    isPrimary: image.is_primary,
  };
}

function mapCategoryMedia(image: CategoryImagePublicRow): MediaAsset {
  return {
    id: image.id,
    url: resolveImageUrl(image.storage_path),
    alt: image.alt_text,
    role: 'main',
    width: 1800,
    height: 1200,
    blurhash: '',
    isPrimary: image.is_primary,
  };
}

function assembleProduct(
  p: ProductPublicRow,
  images: ProductImagePublicRow[],
  category: Category | null,
): Product {
  const media = images
    .filter((img) => img.product_id === p.id)
    .map((img) => mapProductMedia(img, p.name, p.profile_kind));

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description ?? null,
    profileKind: p.profile_kind,
    productType: p.product_type,
    unitType: p.unit_type,
    basePrice: Number(p.base_price),
    minOrderQuantity: p.min_order_quantity,
    isActive: p.is_active,
    category,
    media,
  };
}

export async function listCategories(): Promise<Category[]> {
  const categories = await categoryModel.listAllCategories();
  if (categories.length === 0) return [];

  const categoryIds = categories.map((c) => c.id);
  const images = await mediaModel.findPublicImagesByCategoryIds(categoryIds);

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    media: images
      .filter((img) => img.category_id === c.id)
      .map((img) => mapCategoryMedia(img)),
  }));
}

export async function listProducts(
  query: ProductListQuery,
): Promise<{ items: Product[]; nextCursor: string | null }> {
  let categoryId: string | undefined;
  let categoryMap = new Map<string, Category>();

  if (query.category) {
    const cat = await categoryModel.findCategoryBySlug(query.category);
    if (!cat) {
      return { items: [], nextCursor: null };
    }
    categoryId = cat.id;
    categoryMap.set(cat.id, {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      media: [],
    });
  } else {
    const allCats = await listCategories();
    categoryMap = new Map(allCats.map((c) => [c.id, c]));
  }

  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
  const rawProducts = await productModel.listPublicProducts({
    categoryId,
    cursor,
    limit: query.limit,
  });

  const hasNextPage = rawProducts.length > query.limit;
  const productRows = hasNextPage ? rawProducts.slice(0, query.limit) : rawProducts;

  let nextCursor: string | null = null;
  if (hasNextPage && productRows.length > 0) {
    const last = productRows[productRows.length - 1]!;
    nextCursor = encodeCursor({ createdAt: last.created_at, id: last.id });
  }

  const productIds = productRows.map((p) => p.id);
  const images = await mediaModel.findPublicImagesByProductIds(productIds);

  const items = productRows.map((p) => {
    const cat = categoryMap.get(p.category_id) ?? null;
    return assembleProduct(p, images, cat);
  });

  return { items, nextCursor };
}

export async function getFeaturedProducts(): Promise<Product[]> {
  const rawProducts = await productModel.listFeaturedProducts(6);
  if (rawProducts.length === 0) return [];

  const allCats = await listCategories();
  const categoryMap = new Map(allCats.map((c) => [c.id, c]));

  const productIds = rawProducts.map((p) => p.id);
  const images = await mediaModel.findPublicImagesByProductIds(productIds);

  return rawProducts.map((p) => {
    const cat = categoryMap.get(p.category_id) ?? null;
    return assembleProduct(p, images, cat);
  });
}

export async function getProductBySlug(slug: string): Promise<Product> {
  const p = await productModel.findPublicProductBySlug(slug);
  if (!p) {
    throw new NotFoundError(`Product not found for slug: ${slug}`);
  }

  let category: Category | null = null;
  if (p.category_id) {
    const cat = await categoryModel.findCategoryById(p.category_id);
    if (cat) {
      category = {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        media: [],
      };
    }
  }

  const images = await mediaModel.findPublicImagesByProductIds([p.id]);
  return assembleProduct(p, images, category);
}

export const catalogService = {
  resolveImageUrl,
  getSuggestedAlt,
  encodeCursor,
  decodeCursor,
  listCategories,
  listProducts,
  getFeaturedProducts,
  getProductBySlug,
};

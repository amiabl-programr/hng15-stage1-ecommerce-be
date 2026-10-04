import { env } from '../config/env.ts';
import type {
  Category,
  MediaAsset,
  Product,
  ProductListQuery,
  ProductVariant,
} from '../contracts/schemas/catalog.ts';
import { NotFoundError, ValidationError } from '../lib/errors.ts';
import { categoryModel } from '../models/category.model.ts';
import { mediaModel, type CategoryImagePublicRow, type ProductImagePublicRow } from '../models/media.model.ts';
import {
  productModel,
  type ProductPublicRow,
  type ProductVariantRow,
} from '../models/product.model.ts';

export interface KeysetCursor {
  createdAt: string;
  id: string;
}

const CDN_IMAGE_MAP: Record<string, string> = {
  'long_span.jpg': 'https://images.unsplash.com/photo-1602193289141-9605ad75d0a5?auto=format&fit=crop&w=800&q=80',
  'black_metcopo.jpg': 'https://images.unsplash.com/photo-1610056868457-e61d6f9eeb86?auto=format&fit=crop&w=800&q=80',
  'step-tiles.jpg': 'https://images.unsplash.com/photo-1610056868457-e61d6f9eeb86?auto=format&fit=crop&w=800&q=80',
  'shingles.jpg': 'https://images.unsplash.com/photo-1647546656105-c6a9cfa6f0fd?auto=format&fit=crop&w=800&q=80',
  'corrugated-sheets.jpg': 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
  'gutters.jpg': 'https://images.unsplash.com/photo-1617459973560-33aea09d1c22?auto=format&fit=crop&w=800&q=80',
  'roofing-accessories.jpg': 'https://images.unsplash.com/photo-1647427060142-c18ea9536019?auto=format&fit=crop&w=800&q=80',
  'roll-forming.jpg': 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
  'roll-forming1.jpg': 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
  'roof_bending.jpg': 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
};

const PROFILE_FALLBACK_IMAGES: Record<string, string> = {
  'longspan': 'https://images.unsplash.com/photo-1602193289141-9605ad75d0a5?auto=format&fit=crop&w=800&q=80',
  'metcoppo': 'https://images.unsplash.com/photo-1610056868457-e61d6f9eeb86?auto=format&fit=crop&w=800&q=80',
  'step-tile': 'https://images.unsplash.com/photo-1610056868457-e61d6f9eeb86?auto=format&fit=crop&w=800&q=80',
  'shingle': 'https://images.unsplash.com/photo-1647546656105-c6a9cfa6f0fd?auto=format&fit=crop&w=800&q=80',
  'corrugated': 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
  'ridge': 'https://images.unsplash.com/photo-1617459973560-33aea09d1c22?auto=format&fit=crop&w=800&q=80',
  'trimmer': 'https://images.unsplash.com/photo-1617459973560-33aea09d1c22?auto=format&fit=crop&w=800&q=80',
  'gutter': 'https://images.unsplash.com/photo-1617459973560-33aea09d1c22?auto=format&fit=crop&w=800&q=80',
  'flashing': 'https://images.unsplash.com/photo-1617459973560-33aea09d1c22?auto=format&fit=crop&w=800&q=80',
  'fastener': 'https://images.unsplash.com/photo-1647427060142-c18ea9536019?auto=format&fit=crop&w=800&q=80',
  'roll-forming': 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
  'bending': 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
};

const CATEGORY_FALLBACK_IMAGES: Record<string, string> = {
  'roofing-sheets': 'https://images.unsplash.com/photo-1602193289141-9605ad75d0a5?auto=format&fit=crop&w=800&q=80',
  'metcopo-roofing': 'https://images.unsplash.com/photo-1610056868457-e61d6f9eeb86?auto=format&fit=crop&w=800&q=80',
  'step-tiles': 'https://images.unsplash.com/photo-1610056868457-e61d6f9eeb86?auto=format&fit=crop&w=800&q=80',
  'shingles': 'https://images.unsplash.com/photo-1647546656105-c6a9cfa6f0fd?auto=format&fit=crop&w=800&q=80',
  'corrugated-sheets': 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
  'ridge-caps': 'https://images.unsplash.com/photo-1617459973560-33aea09d1c22?auto=format&fit=crop&w=800&q=80',
  'parapets': 'https://images.unsplash.com/photo-1617459973560-33aea09d1c22?auto=format&fit=crop&w=800&q=80',
  'accessories': 'https://images.unsplash.com/photo-1647427060142-c18ea9536019?auto=format&fit=crop&w=800&q=80',
  'trimmers-and-gutters': 'https://images.unsplash.com/photo-1617459973560-33aea09d1c22?auto=format&fit=crop&w=800&q=80',
  'roll-forming': 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
  'bending-services': 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
};

export function resolveImageUrl(storagePath: string): string {
  if (!storagePath) return '';
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
    return storagePath;
  }
  const filename = storagePath.split('/').pop() || storagePath;
  if (CDN_IMAGE_MAP[filename]) {
    return CDN_IMAGE_MAP[filename];
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

function mapProductVariant(v: ProductVariantRow): ProductVariant {
  return {
    id: v.id,
    name: v.name,
    sku: v.sku,
    priceOverride: v.price_override !== null ? Number(v.price_override) : null,
    stockQuantity: v.stock_quantity,
    isActive: v.is_active,
  };
}

function assembleProduct(
  p: ProductPublicRow,
  images: ProductImagePublicRow[],
  category: Category | null,
  variants: ProductVariantRow[] = [],
): Product {
  const media = images
    .filter((img) => img.product_id === p.id)
    .map((img) => mapProductMedia(img, p.name, p.profile_kind));

  if (media.length === 0) {
    const fallbackUrl = PROFILE_FALLBACK_IMAGES[p.profile_kind] || 'https://images.unsplash.com/photo-1602193289141-9605ad75d0a5?auto=format&fit=crop&w=800&q=80';
    media.push({
      id: p.id,
      url: fallbackUrl,
      alt: `Photograph of ${p.name}`,
      role: 'main',
      width: 800,
      height: 600,
      blurhash: '',
      isPrimary: true,
    });
  }

  const productVariants = variants
    .filter((v) => v.product_id === p.id)
    .map(mapProductVariant);

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description ?? null,
    profileKind: p.profile_kind,
    productType: p.product_type,
    unitType: p.unit ?? p.unit_type ?? 'piece',
    basePrice: Number(p.base_price),
    minOrderQuantity: p.min_order_quantity,
    isActive: p.is_active,
    category,
    media,
    variants: productVariants,
  };
}

export async function listCategories(): Promise<Category[]> {
  const categories = await categoryModel.listAllCategories();
  if (categories.length === 0) return [];

  const categoryIds = categories.map((c) => c.id);
  const images = await mediaModel.findPublicImagesByCategoryIds(categoryIds);

  return categories.map((c) => {
    const categoryImages = images
      .filter((img) => img.category_id === c.id)
      .map((img) => mapCategoryMedia(img));

    if (categoryImages.length === 0) {
      const fallbackUrl = CATEGORY_FALLBACK_IMAGES[c.slug] || 'https://images.unsplash.com/photo-1602193289141-9605ad75d0a5?auto=format&fit=crop&w=800&q=80';
      categoryImages.push({
        id: c.id,
        url: fallbackUrl,
        alt: `${c.name} Category Cover`,
        role: 'main',
        width: 800,
        height: 600,
        blurhash: '',
        isPrimary: true,
      });
    }

    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      media: categoryImages,
    };
  });
}

export async function listProducts(
  query: ProductListQuery,
): Promise<{ items: Product[]; nextCursor: string | null }> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
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
  const [images, variants] = await Promise.all([
    mediaModel.findPublicImagesByProductIds(productIds),
    productModel.findVariantsByProductIds(productIds),
  ]);

  const items = productRows.map((p) => {
    const cat = categoryMap.get(p.category_id) ?? null;
    return assembleProduct(p, images, cat, variants);
  });

  return { items, nextCursor };
}

export async function getFeaturedProducts(): Promise<Product[]> {
  const rawProducts = await productModel.listFeaturedProducts(6);
  if (rawProducts.length === 0) return [];

  const allCats = await listCategories();
  const categoryMap = new Map(allCats.map((c) => [c.id, c]));

  const productIds = rawProducts.map((p) => p.id);
  const [images, variants] = await Promise.all([
    mediaModel.findPublicImagesByProductIds(productIds),
    productModel.findVariantsByProductIds(productIds),
  ]);

  return rawProducts.map((p) => {
    const cat = categoryMap.get(p.category_id) ?? null;
    return assembleProduct(p, images, cat, variants);
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

  const [images, variants] = await Promise.all([
    mediaModel.findPublicImagesByProductIds([p.id]),
    productModel.findVariantsByProductIds([p.id]),
  ]);
  return assembleProduct(p, images, category, variants);
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

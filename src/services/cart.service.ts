import { db } from '../config/supabase.ts';
import type { Database } from '../config/database.types.ts';
import { cartModel } from '../models/cart.model.ts';
import { productModel } from '../models/product.model.ts';
import { mediaModel } from '../models/media.model.ts';
import { resolveImageUrl } from './catalog.service.ts';
import type { CartItem, AddCartItemRequest, UpdateCartItemRequest } from '../contracts/schemas/cart.ts';
import type { CustomSpecs } from '../contracts/schemas/checkout.ts';
import { NotFoundError, ValidationError } from '../lib/errors.ts';

export async function getCart(profileId: string): Promise<{ items: CartItem[]; subtotal: number }> {
  const rows = await cartModel.getCartByProfileId(profileId);
  if (rows.length === 0) {
    return { items: [], subtotal: 0 };
  }

  const productIds = Array.from(new Set(rows.map((r) => r.product_id)));
  const variantIds = Array.from(new Set(rows.map((r) => r.variant_id).filter((id): id is string => Boolean(id))));

  // Fetch products
  const { data: productsData } = await db
    .from('products')
    .select('id, name, slug, base_price, product_type, is_active')
    .in('id', productIds);
  const products = (productsData || []) as Database['public']['Tables']['products']['Row'][];
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Fetch variants
  let variants: Database['public']['Tables']['product_variants']['Row'][] = [];
  if (variantIds.length > 0) {
    const { data: variantsData } = await db
      .from('product_variants')
      .select('*')
      .in('id', variantIds);
    variants = (variantsData || []) as Database['public']['Tables']['product_variants']['Row'][];
  }
  const variantMap = new Map(variants.map((v) => [v.id, v]));

  // Fetch images
  const images = await mediaModel.findPublicImagesByProductIds(productIds);
  const imageMap = new Map<string, string>();
  for (const img of images) {
    if (!imageMap.has(img.product_id) || img.is_primary) {
      imageMap.set(img.product_id, resolveImageUrl(img.storage_path));
    }
  }

  const items: CartItem[] = [];

  for (const row of rows) {
    const product = productMap.get(row.product_id);
    if (!product) continue;

    const variant = row.variant_id ? variantMap.get(row.variant_id) : null;
    const basePrice = Number(product.base_price);
    const effectivePrice = variant?.price_override != null ? Number(variant.price_override) : basePrice;

    const customSpecs = row.custom_specs as CustomSpecs | null;
    let unitPrice = effectivePrice;
    if (product.product_type === 'dimensioned' && customSpecs?.lengthMetres && customSpecs.lengthMetres > 0) {
      unitPrice = Math.round(unitPrice * customSpecs.lengthMetres);
    }

    const lineTotal = Math.round(unitPrice * row.quantity);

    items.push({
      id: row.id,
      productId: row.product_id,
      variantId: row.variant_id,
      productName: product.name,
      productSlug: product.slug,
      mediaUrl: imageMap.get(row.product_id) ?? null,
      unitPrice,
      quantity: row.quantity,
      lineTotal,
      customSpecs,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  const subtotal = items.reduce((acc, item) => acc + item.lineTotal, 0);

  return { items, subtotal };
}

export async function addItem(
  profileId: string,
  req: AddCartItemRequest,
): Promise<{ items: CartItem[]; subtotal: number }> {
  const product = await productModel.findProductById(req.productId);
  if (!product) {
    throw new NotFoundError('Product not found');
  }
  if (!product.is_active) {
    throw new ValidationError('Product is not active');
  }

  if (req.variantId) {
    const variants = await productModel.findVariantsByProductIds([req.productId]);
    const variant = variants.find((v) => v.id === req.variantId);
    if (!variant || !variant.is_active) {
      throw new ValidationError('Variant not found or is inactive');
    }
  }

  await cartModel.addItem(
    profileId,
    req.productId,
    req.variantId ?? null,
    req.quantity,
    req.customSpecs ?? null,
  );

  return getCart(profileId);
}

export async function updateItemQuantity(
  itemId: string,
  profileId: string,
  req: UpdateCartItemRequest,
): Promise<{ items: CartItem[]; subtotal: number }> {
  if (req.quantity <= 0) {
    await cartModel.removeItem(itemId, profileId);
  } else {
    await cartModel.updateItemQuantity(itemId, profileId, req.quantity);
  }
  return getCart(profileId);
}

export async function removeItem(
  itemId: string,
  profileId: string,
): Promise<{ items: CartItem[]; subtotal: number }> {
  await cartModel.removeItem(itemId, profileId);
  return getCart(profileId);
}

export async function clearCart(profileId: string): Promise<void> {
  await cartModel.clearCart(profileId);
}

export const cartService = {
  getCart,
  addItem,
  updateItemQuantity,
  removeItem,
  clearCart,
};

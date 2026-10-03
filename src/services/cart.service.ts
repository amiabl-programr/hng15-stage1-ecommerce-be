import { cartModel, type CartItemWithProduct } from '../models/cart.model.ts';
import { productModel } from '../models/product.model.ts';
import type { CartItem, AddCartItemRequest, UpdateCartItemRequest } from '../contracts/schemas/cart.ts';
import type { CustomSpecs } from '../contracts/schemas/checkout.ts';
import { NotFoundError, ValidationError } from '../lib/errors.ts';

function mapToCartItem(item: CartItemWithProduct): CartItem {
  const basePrice = Number(item.product.base_price);
  const variantAdj = item.variant ? Number(item.variant.price_adjustment) : 0;
  let unitPrice = basePrice + variantAdj;
  const customSpecs = item.custom_specs as CustomSpecs | null;
  
  if (item.product.product_type === 'dimensioned' && customSpecs && customSpecs.lengthMetres) {
    unitPrice = unitPrice * customSpecs.lengthMetres;
  }
  
  const lineTotal = unitPrice * item.quantity;
  
  return {
    id: item.id,
    productId: item.product_id,
    variantId: item.variant_id,
    productName: item.product.name,
    productSlug: item.product.slug,
    mediaUrl: item.media?.media_url ?? null,
    unitPrice,
    quantity: item.quantity,
    lineTotal,
    customSpecs,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

export async function getCart(profileId: string): Promise<{ items: CartItem[]; subtotal: number }> {
  const items = await cartModel.getCartByProfileId(profileId);
  
  const mapped = items.map(mapToCartItem);
  const subtotal = mapped.reduce((acc, item) => acc + item.lineTotal, 0);
  
  return {
    items: mapped,
    subtotal,
  };
}

export async function addItem(profileId: string, req: AddCartItemRequest): Promise<{ items: CartItem[]; subtotal: number }> {
  // Validate product exists and is active
  const product = await productModel.findProductById(req.productId);
  if (!product) {
    throw new NotFoundError('Product not found');
  }
  if (!product.is_active) {
    throw new ValidationError('Product is not active');
  }
  
  // Verify variant if provided
  if (req.variantId) {
    const variants = await productModel.findVariantsByProductIds([req.productId]);
    const variant = variants.find(v => v.id === req.variantId);
    if (!variant || !variant.is_active) {
      throw new ValidationError('Variant not found or is inactive');
    }
  } else {
    // If the product requires a variant (has variants), we might want to enforce providing it,
    // but the db schema might not enforce it. Let's just pass through for now unless explicitly needed.
  }
  
  await cartModel.addItem(
    profileId,
    req.productId,
    req.variantId ?? null,
    req.quantity,
    req.customSpecs ?? null
  );
  
  return getCart(profileId);
}

export async function updateItemQuantity(
  itemId: string,
  profileId: string,
  req: UpdateCartItemRequest
): Promise<{ items: CartItem[]; subtotal: number }> {
  await cartModel.updateItemQuantity(itemId, profileId, req.quantity);
  return getCart(profileId);
}

export async function removeItem(
  itemId: string,
  profileId: string
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

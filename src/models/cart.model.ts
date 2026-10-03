import { db } from '../config/supabase.ts';
import type { Database, Json } from '../config/database.types.ts';
import { InternalError } from '../lib/errors.ts';

export type CartItemRow = Database['public']['Tables']['cart_items']['Row'];
export type CartItemInsert = Database['public']['Tables']['cart_items']['Insert'];
export type ProductType = Database['public']['Enums']['product_type'];

export interface CartItemWithProduct extends CartItemRow {
  product: {
    name: string;
    slug: string;
    base_price: number;
    product_type: ProductType;
  };
  variant: {
    name: string;
    price_adjustment: number;
  } | null;
  media: {
    media_url: string;
  } | null;
}

export async function getCartByProfileId(profileId: string): Promise<CartItemWithProduct[]> {
  const { data, error } = await (db.from('cart_items') as any)
    .select(`
      *,
      product:products ( name, slug, base_price, product_type ),
      variant:product_variants ( name, price_adjustment ),
      product_images ( image_url, role )
    `)
    .eq('profile_id', profileId);

  if (error) {
    throw new InternalError(error);
  }

  const items = ((data as any[]) || []).map((item) => {
    let mediaUrl: string | null = null;
    if (item.product_images && Array.isArray(item.product_images)) {
      const primary = item.product_images.find((m: any) => m.role === 'primary');
      if (primary) {
        mediaUrl = primary.image_url;
      } else if (item.product_images.length > 0) {
        mediaUrl = item.product_images[0].image_url;
      }
    }

    return {
      ...item,
      product: Array.isArray(item.product) ? item.product[0] : item.product,
      variant: Array.isArray(item.variant) ? item.variant[0] : item.variant,
      media: mediaUrl ? { media_url: mediaUrl } : null,
    };
  });

  return items as CartItemWithProduct[];
}

export async function addItem(
  profileId: string,
  productId: string,
  variantId: string | null,
  quantity: number,
  customSpecs: Json | null,
): Promise<CartItemRow> {
  let query = (db.from('cart_items') as any)
    .select('*')
    .eq('profile_id', profileId)
    .eq('product_id', productId);
  
  if (variantId) {
    query = query.eq('variant_id', variantId);
  } else {
    query = query.is('variant_id', null);
  }

  const { data: existing, error: existError } = await query;

  if (existError) {
    throw new InternalError(existError);
  }

  const existingItem = existing && existing.length > 0 ? (existing as CartItemRow[]).find((i) => 
    JSON.stringify(i.custom_specs) === JSON.stringify(customSpecs)
  ) : null;

  if (existingItem) {
    const newQuantity = existingItem.quantity + quantity;
    const { data: updated, error: updateError } = await (db.from('cart_items') as any)
      .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
      .eq('id', existingItem.id)
      .select('*')
      .single();

    if (updateError) throw new InternalError(updateError);
    return updated as CartItemRow;
  } else {
    const { data: inserted, error: insertError } = await (db.from('cart_items') as any)
      .insert({
        profile_id: profileId,
        product_id: productId,
        variant_id: variantId,
        quantity,
        custom_specs: customSpecs,
      })
      .select('*')
      .single();

    if (insertError) throw new InternalError(insertError);
    return inserted as CartItemRow;
  }
}

export async function updateItemQuantity(
  itemId: string,
  profileId: string,
  quantity: number,
): Promise<CartItemRow> {
  const { data, error } = await (db.from('cart_items') as any)
    .update({ quantity, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('profile_id', profileId)
    .select('*')
    .single();

  if (error) {
    throw new InternalError(error);
  }

  return data as CartItemRow;
}

export async function removeItem(itemId: string, profileId: string): Promise<boolean> {
  const { error, count } = await (db.from('cart_items') as any)
    .delete({ count: 'exact' })
    .eq('id', itemId)
    .eq('profile_id', profileId);

  if (error) {
    throw new InternalError(error);
  }

  return (count ?? 0) > 0;
}

export async function clearCart(profileId: string): Promise<boolean> {
  const { error, count } = await (db.from('cart_items') as any)
    .delete({ count: 'exact' })
    .eq('profile_id', profileId);

  if (error) {
    throw new InternalError(error);
  }

  return (count ?? 0) > 0;
}

export const cartModel = {
  getCartByProfileId,
  addItem,
  updateItemQuantity,
  removeItem,
  clearCart,
};

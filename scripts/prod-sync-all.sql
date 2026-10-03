-- ==========================================================
-- PRODUCTION DATABASE SYNC SCRIPT
-- Run this in your Production Supabase SQL Editor
-- ==========================================================

-- 1. Table: public.email_outbox
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_outbox_pending_idx 
  ON public.email_outbox (created_at) 
  WHERE sent_at IS NULL AND attempts < 5;

-- 2. Table: public.cart_items
CREATE TABLE IF NOT EXISTS public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  custom_specs JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cart_items_profile_id ON public.cart_items(profile_id);

-- 3. Sequence: order_number_seq
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1001;

-- 4. Function: create_order RPC
CREATE OR REPLACE FUNCTION public.create_order(
  p_profile_id UUID,
  p_customer JSONB,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id UUID := gen_random_uuid();
  v_order_number TEXT;
  v_subtotal BIGINT := 0;
  v_delivery_fee BIGINT := 15000; -- Standard ₦15,000 delivery fee
  v_total BIGINT := 0;
  v_item JSONB;
  v_product RECORD;
  v_variant RECORD;
  v_unit_price BIGINT;
  v_line_total BIGINT;
  v_quantity INT;
  v_length NUMERIC;
  v_custom_specs JSONB;
  v_order JSONB;
  v_calculated_items JSONB := '[]'::JSONB;
BEGIN
  -- Generate order number (e.g. RC-1001)
  v_order_number := 'RC-' || nextval('public.order_number_seq')::TEXT;

  -- First Pass: validate products, check stock, calculate prices and subtotal
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := COALESCE((v_item->>'quantity')::INT, 1);
    v_custom_specs := v_item->'customSpecs';

    -- Look up product
    SELECT * INTO v_product 
    FROM public.products 
    WHERE id = (v_item->>'productId')::UUID AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product with id % not found or inactive', (v_item->>'productId');
    END IF;

    -- Look up variant if specified
    IF v_item->>'variantId' IS NOT NULL THEN
      SELECT * INTO v_variant 
      FROM public.product_variants 
      WHERE id = (v_item->>'variantId')::UUID AND is_active = true;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant with id % not found or inactive', (v_item->>'variantId');
      END IF;

      -- Check stock
      IF v_variant.stock_quantity < v_quantity THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Only % items left in stock for %', v_variant.stock_quantity, v_variant.name;
      END IF;

      -- Decrement stock
      UPDATE public.product_variants
      SET stock_quantity = stock_quantity - v_quantity,
          updated_at = now()
      WHERE id = v_variant.id;

      -- Determine price (variant price_override or base_price)
      v_unit_price := COALESCE(v_variant.price_override, v_product.base_price);
    ELSE
      v_unit_price := v_product.base_price;
    END IF;

    -- Calculate line total based on product type
    IF v_product.product_type = 'dimensioned' AND v_custom_specs IS NOT NULL AND (v_custom_specs->>'lengthMetres') IS NOT NULL THEN
      v_length := (v_custom_specs->>'lengthMetres')::NUMERIC;
      v_line_total := ROUND(v_unit_price * v_length * v_quantity);
    ELSE
      v_line_total := v_unit_price * v_quantity;
    END IF;

    v_subtotal := v_subtotal + v_line_total;

    -- Accumulate item for insertion
    v_calculated_items := v_calculated_items || jsonb_build_object(
      'product_id', v_product.id,
      'variant_id', CASE WHEN v_item->>'variantId' IS NOT NULL THEN (v_item->>'variantId')::UUID ELSE NULL END,
      'product_name', v_product.name,
      'unit_price', v_unit_price,
      'quantity', v_quantity,
      'line_total', v_line_total,
      'custom_specs', v_custom_specs
    );
  END LOOP;

  -- Compute total amount
  v_total := v_subtotal + v_delivery_fee;

  -- Create order record with validated matching totals
  INSERT INTO public.orders (
    id,
    order_number,
    profile_id,
    status,
    payment_status,
    payment_method,
    customer_name,
    customer_email,
    customer_phone,
    delivery_address,
    subtotal,
    delivery_fee,
    total_amount,
    notes
  ) VALUES (
    v_order_id,
    v_order_number,
    p_profile_id,
    'pending'::order_status,
    'pending'::payment_status,
    COALESCE((p_customer->>'paymentMethod')::payment_method, 'transfer'::payment_method),
    COALESCE(p_customer->>'fullName', 'Valued Customer'),
    COALESCE(p_customer->>'email', ''),
    COALESCE(p_customer->>'phone', ''),
    jsonb_build_object(
      'streetAddress', COALESCE(p_customer->>'streetAddress', ''),
      'city', COALESCE(p_customer->>'city', ''),
      'state', COALESCE(p_customer->>'state', ''),
      'additionalInstructions', p_customer->>'additionalInstructions'
    ),
    v_subtotal,
    v_delivery_fee,
    v_total,
    NULL
  );

  -- Insert all order items
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_calculated_items)
  LOOP
    INSERT INTO public.order_items (
      order_id,
      product_id,
      variant_id,
      product_name,
      unit_price,
      quantity,
      line_total,
      custom_specs
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      CASE WHEN v_item->>'variant_id' IS NOT NULL THEN (v_item->>'variant_id')::UUID ELSE NULL END,
      v_item->>'product_name',
      (v_item->>'unit_price')::BIGINT,
      (v_item->>'quantity')::INT,
      (v_item->>'line_total')::BIGINT,
      v_item->'custom_specs'
    );
  END LOOP;

  -- Return the created order as JSON
  SELECT to_jsonb(o.*) INTO v_order
  FROM public.orders o
  WHERE o.id = v_order_id;

  RETURN v_order;
END;
$$;

-- 5. Permissions & Grants on Schema public
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role, postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role, postgres;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role, postgres;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role, postgres;

-- 6. Grant execute on create_order RPC
GRANT EXECUTE ON FUNCTION public.create_order(UUID, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, JSONB, JSONB) TO anon;

-- 7. Enable RLS
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fabrication_requests ENABLE ROW LEVEL SECURITY;

-- 8. Force reload of PostgREST schema cache
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

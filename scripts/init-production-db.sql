-- ==============================================================================
-- COMPLETE PRODUCTION DATABASE INITIALIZATION SCRIPT
-- Run this in your Production Supabase SQL Editor to initialize all tables & data
-- ==============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Custom Enum Types
DO $$ BEGIN
  CREATE TYPE public.image_role AS ENUM ('main', 'profile', 'installed', 'detail');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('pending', 'payment_pending', 'paid', 'processing', 'ready_for_delivery', 'shipped', 'completed', 'cancelled', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('transfer', 'cash_on_delivery', 'card');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.permission_status AS ENUM ('own', 'approved', 'not-required', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.product_type AS ENUM ('standard', 'dimensioned', 'service');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.profile_kind AS ENUM ('longspan', 'metcoppo', 'step-tile', 'corrugated', 'shingle', 'ridge', 'trimmer', 'flashing', 'gutter', 'fastener', 'roll-forming', 'bending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.unit_type AS ENUM ('piece', 'metre', 'bundle', 'sqm', 'service', 'roll');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('customer', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Tables & Constraints

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  role public.user_role DEFAULT 'customer'::user_role NOT NULL,
  full_name text,
  email text NOT NULL,
  phone text,
  avatar_url text,
  google_id text,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  image_url text,
  display_order int4 DEFAULT 0 NOT NULL,
  is_active bool DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  profile_kind public.profile_kind DEFAULT 'longspan'::profile_kind NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  category_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL,
  short_description text,
  product_type public.product_type DEFAULT 'standard'::product_type NOT NULL,
  base_price int8 DEFAULT 0 NOT NULL,
  unit public.unit_type DEFAULT 'piece'::unit_type NOT NULL,
  min_order_quantity int4 DEFAULT 1 NOT NULL,
  is_active bool DEFAULT true NOT NULL,
  is_featured bool DEFAULT false NOT NULL,
  specifications jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  profile_kind public.profile_kind DEFAULT 'longspan'::profile_kind NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  name text NOT NULL,
  sku text NOT NULL,
  price_override int8,
  attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
  stock_quantity int4 DEFAULT 0 NOT NULL,
  is_active bool DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  image_url text,
  alt_text text NOT NULL,
  display_order int4 DEFAULT 0 NOT NULL,
  is_primary bool DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  storage_path text DEFAULT ''::text NOT NULL,
  role public.image_role DEFAULT 'detail'::image_role NOT NULL,
  width int4,
  height int4,
  bytes int4,
  mime_type text,
  blurhash text,
  source text DEFAULT 'own'::text NOT NULL,
  source_url text,
  license text DEFAULT 'unknown'::text NOT NULL,
  permission_status public.permission_status DEFAULT 'pending'::permission_status NOT NULL,
  uploaded_by uuid,
  deleted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.category_images (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  category_id uuid NOT NULL,
  storage_path text DEFAULT ''::text NOT NULL,
  alt_text text DEFAULT 'Category photograph'::text NOT NULL,
  role public.image_role DEFAULT 'main'::image_role NOT NULL,
  display_order int4 DEFAULT 0 NOT NULL,
  is_primary bool DEFAULT false NOT NULL,
  width int4,
  height int4,
  bytes int4,
  mime_type text,
  blurhash text,
  source text DEFAULT 'own'::text NOT NULL,
  source_url text,
  license text DEFAULT 'unknown'::text NOT NULL,
  permission_status public.permission_status DEFAULT 'pending'::permission_status NOT NULL,
  uploaded_by uuid,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_number text NOT NULL,
  profile_id uuid,
  status public.order_status DEFAULT 'pending'::order_status NOT NULL,
  payment_status public.payment_status DEFAULT 'pending'::payment_status NOT NULL,
  payment_method public.payment_method DEFAULT 'transfer'::payment_method NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text NOT NULL,
  delivery_address jsonb NOT NULL,
  subtotal int8 NOT NULL,
  delivery_fee int8 DEFAULT 0 NOT NULL,
  total_amount int8 NOT NULL,
  notes text,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  product_id uuid,
  variant_id uuid,
  product_name text NOT NULL,
  unit_price int8 NOT NULL,
  quantity int4 NOT NULL,
  custom_specs jsonb,
  line_total int8 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid,
  quantity int4 NOT NULL,
  custom_specs jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.fabrication_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid,
  order_item_id uuid,
  service_type text NOT NULL,
  specifications jsonb DEFAULT '{}'::jsonb NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  notes text,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  token_hash text NOT NULL,
  profile_id uuid NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent text,
  ip inet,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id int8 NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before jsonb,
  after jsonb,
  ip inet,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.email_outbox (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  template text NOT NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  html_body text NOT NULL,
  text_body text,
  order_id uuid,
  attempts int4 DEFAULT 0 NOT NULL,
  last_error text,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

-- 3. Sequences
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1001;

-- 4. Foreign Key Constraints
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_product_id_fkey') THEN
    ALTER TABLE public.inventory ADD CONSTRAINT inventory_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_variant_id_fkey') THEN
    ALTER TABLE public.inventory ADD CONSTRAINT inventory_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'addresses_profile_id_fkey') THEN
    ALTER TABLE public.addresses ADD CONSTRAINT addresses_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_category_id_fkey') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_variants_product_id_fkey') THEN
    ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_images_product_id_fkey') THEN
    ALTER TABLE public.product_images ADD CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_profile_id_fkey') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_order_id_fkey') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_product_id_fkey') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_variant_id_fkey') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fabrication_requests_profile_id_fkey') THEN
    ALTER TABLE public.fabrication_requests ADD CONSTRAINT fabrication_requests_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fabrication_requests_order_item_id_fkey') THEN
    ALTER TABLE public.fabrication_requests ADD CONSTRAINT fabrication_requests_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_images_uploaded_by_fkey') THEN
    ALTER TABLE public.product_images ADD CONSTRAINT product_images_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'category_images_category_id_fkey') THEN
    ALTER TABLE public.category_images ADD CONSTRAINT category_images_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'category_images_uploaded_by_fkey') THEN
    ALTER TABLE public.category_images ADD CONSTRAINT category_images_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_outbox_order_id_fkey') THEN
    ALTER TABLE public.email_outbox ADD CONSTRAINT email_outbox_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_profile_id_fkey') THEN
    ALTER TABLE public.sessions ADD CONSTRAINT sessions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_actor_id_fkey') THEN
    ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_profile_id_fkey') THEN
    ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_product_id_fkey') THEN
    ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_variant_id_fkey') THEN
    ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Indexes
CREATE UNIQUE INDEX profiles_email_key ON public.profiles USING btree (email);
CREATE UNIQUE INDEX idx_profiles_email_lower ON public.profiles USING btree (lower(email));
CREATE UNIQUE INDEX idx_profiles_google_id ON public.profiles USING btree (google_id) WHERE (google_id IS NOT NULL);
CREATE INDEX idx_images_product ON public.product_images USING btree (product_id);
CREATE UNIQUE INDEX product_images_path_unique ON public.product_images USING btree (storage_path) WHERE (storage_path <> ''::text);
CREATE UNIQUE INDEX product_images_one_primary ON public.product_images USING btree (product_id) WHERE (is_primary AND (deleted_at IS NULL));
CREATE UNIQUE INDEX product_images_ordered ON public.product_images USING btree (product_id, display_order) WHERE (deleted_at IS NULL);
CREATE INDEX product_images_uploaded_by_idx ON public.product_images USING btree (uploaded_by);
CREATE UNIQUE INDEX products_slug_key ON public.products USING btree (slug);
CREATE INDEX idx_products_category ON public.products USING btree (category_id);
CREATE INDEX idx_products_slug ON public.products USING btree (slug);
CREATE INDEX idx_products_active ON public.products USING btree (is_active);
CREATE UNIQUE INDEX categories_slug_key ON public.categories USING btree (slug);
CREATE UNIQUE INDEX orders_order_number_key ON public.orders USING btree (order_number);
CREATE INDEX idx_orders_profile ON public.orders USING btree (profile_id);
CREATE INDEX idx_orders_status ON public.orders USING btree (status);
CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);
CREATE INDEX idx_order_items_product ON public.order_items USING btree (product_id);
CREATE INDEX idx_order_items_variant ON public.order_items USING btree (variant_id);
CREATE INDEX idx_fabrication_profile ON public.fabrication_requests USING btree (profile_id);
CREATE INDEX idx_fabrication_order_item ON public.fabrication_requests USING btree (order_item_id);
CREATE UNIQUE INDEX product_variants_sku_key ON public.product_variants USING btree (sku);
CREATE INDEX idx_variants_product ON public.product_variants USING btree (product_id);
CREATE UNIQUE INDEX uq_inventory_product_variant ON public.inventory USING btree (product_id, variant_id) NULLS NOT DISTINCT;
CREATE INDEX idx_inventory_product ON public.inventory USING btree (product_id);
CREATE INDEX idx_inventory_variant ON public.inventory USING btree (variant_id);
CREATE INDEX idx_addresses_profile ON public.addresses USING btree (profile_id);
CREATE UNIQUE INDEX sessions_token_hash_key ON public.sessions USING btree (token_hash);
CREATE INDEX idx_sessions_token_hash ON public.sessions USING btree (token_hash);
CREATE INDEX idx_sessions_profile_id ON public.sessions USING btree (profile_id);
CREATE INDEX idx_email_outbox_pending ON public.email_outbox USING btree (created_at) WHERE ((sent_at IS NULL) AND (attempts < 5));
CREATE INDEX email_outbox_pending_idx ON public.email_outbox USING btree (created_at) WHERE ((sent_at IS NULL) AND (attempts < 5));
CREATE INDEX category_images_category_id_idx ON public.category_images USING btree (category_id);
CREATE INDEX category_images_uploaded_by_idx ON public.category_images USING btree (uploaded_by);
CREATE UNIQUE INDEX category_images_path_unique ON public.category_images USING btree (storage_path) WHERE (storage_path <> ''::text);
CREATE UNIQUE INDEX category_images_one_primary ON public.category_images USING btree (category_id) WHERE (is_primary AND (deleted_at IS NULL));
CREATE UNIQUE INDEX category_images_ordered ON public.category_images USING btree (category_id, display_order) WHERE (deleted_at IS NULL);
CREATE INDEX idx_audit_log_actor_id ON public.audit_log USING btree (actor_id);
CREATE INDEX idx_audit_log_entity ON public.audit_log USING btree (entity_type, entity_id);
CREATE INDEX idx_cart_items_profile_id ON public.cart_items USING btree (profile_id);

-- 6. Stored Procedures & Functions
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
  v_delivery_fee BIGINT := 15000;
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
  v_order_number := 'RC-' || nextval('public.order_number_seq')::TEXT;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := COALESCE((v_item->>'quantity')::INT, 1);
    v_custom_specs := v_item->'customSpecs';

    SELECT * INTO v_product 
    FROM public.products 
    WHERE id = (v_item->>'productId')::UUID AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product with id % not found or inactive', (v_item->>'productId');
    END IF;

    IF v_item->>'variantId' IS NOT NULL THEN
      SELECT * INTO v_variant 
      FROM public.product_variants 
      WHERE id = (v_item->>'variantId')::UUID AND is_active = true;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant with id % not found or inactive', (v_item->>'variantId');
      END IF;

      IF v_variant.stock_quantity < v_quantity THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Only % items left in stock for %', v_variant.stock_quantity, v_variant.name;
      END IF;

      UPDATE public.product_variants
      SET stock_quantity = stock_quantity - v_quantity,
          updated_at = now()
      WHERE id = v_variant.id;

      v_unit_price := COALESCE(v_variant.price_override, v_product.base_price);
    ELSE
      v_unit_price := v_product.base_price;
    END IF;

    IF v_product.product_type = 'dimensioned' AND v_custom_specs IS NOT NULL AND (v_custom_specs->>'lengthMetres') IS NOT NULL THEN
      v_length := (v_custom_specs->>'lengthMetres')::NUMERIC;
      v_line_total := ROUND(v_unit_price * v_length * v_quantity);
    ELSE
      v_line_total := v_unit_price * v_quantity;
    END IF;

    v_subtotal := v_subtotal + v_line_total;

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

  v_total := v_subtotal + v_delivery_fee;

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

  SELECT to_jsonb(o.*) INTO v_order
  FROM public.orders o
  WHERE o.id = v_order_id;

  RETURN v_order;
END;
$$;

-- 7. Schema Permissions & Privileges
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role, postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role, postgres;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role, postgres;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role, postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role, postgres;

GRANT EXECUTE ON FUNCTION public.create_order(UUID, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, JSONB, JSONB) TO anon;

-- 8. Enable Row Level Security
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.category_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fabrication_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.email_outbox ENABLE ROW LEVEL SECURITY;

-- 9. Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
-- ==============================================================================
-- Catalogue Seed: 11 Production Categories, 17 Products (15 Physical, 2 Services), 48 Variants
-- Strictly derived from seed_data.md
-- ==============================================================================

-- 1. Remove Test/Race Categories & Obsolete Slugs (Â§3)
DELETE FROM public.product_variants 
WHERE product_id IN (SELECT id FROM public.products WHERE category_id IN (
  SELECT id FROM public.categories WHERE slug LIKE 'phase4-cat-race%' OR slug LIKE 'race-cat%'
));

DELETE FROM public.products 
WHERE category_id IN (
  SELECT id FROM public.categories WHERE slug LIKE 'phase4-cat-race%' OR slug LIKE 'race-cat%'
);

DELETE FROM public.categories 
WHERE slug LIKE 'phase4-cat-race%' OR slug LIKE 'race-cat%';

-- Ensure trimmers-and-gutters exists first
INSERT INTO public.categories (name, slug, description)
VALUES ('Trimmers & Gutters', 'trimmers-and-gutters', 'Valley gutters, roof trimmers and associated drainage components.')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Reassign products and category_images pointing to trimmers-and-parapets to trimmers-and-gutters
UPDATE public.products 
SET category_id = (SELECT id FROM public.categories WHERE slug = 'trimmers-and-gutters')
WHERE category_id IN (SELECT id FROM public.categories WHERE slug = 'trimmers-and-parapets');

UPDATE public.category_images 
SET category_id = (SELECT id FROM public.categories WHERE slug = 'trimmers-and-gutters')
WHERE category_id IN (SELECT id FROM public.categories WHERE slug = 'trimmers-and-parapets');

DELETE FROM public.categories WHERE slug = 'trimmers-and-parapets';

-- Remove obsolete initial test product slugs not in seed_data.md
DELETE FROM public.product_variants WHERE sku IN ('LS-050-FG', 'RC-APEX-2M', 'ACC-HEX-100');
DELETE FROM public.product_variants WHERE product_id IN (
  SELECT id FROM public.products WHERE slug IN (
    'metcopo-steptile-profile-sheet',
    'stone-coated-shake-shingle-tile',
    'heavy-gauge-ridged-apex-cap',
    'on-site-continuous-roll-forming-service',
    'custom-cnc-sheet-bending-and-curving-service',
    'self-drilling-hex-roofing-screws-pack-100'
  )
);
DELETE FROM public.products WHERE slug IN (
  'metcopo-steptile-profile-sheet',
  'stone-coated-shake-shingle-tile',
  'heavy-gauge-ridged-apex-cap',
  'on-site-continuous-roll-forming-service',
  'custom-cnc-sheet-bending-and-curving-service',
  'self-drilling-hex-roofing-screws-pack-100'
);

-- 2. Upsert Production Categories (11 Total)
INSERT INTO public.categories (name, slug, description)
VALUES
  ('Roofing Sheets', 'roofing-sheets', 'Industrial and residential longspan roofing sheets available in custom lengths.'),
  ('Metcopo Roofing', 'metcopo-roofing', 'Tile-effect roofing sheets designed for architectural residential and commercial applications.'),
  ('Step Tiles', 'step-tiles', 'Stepped architectural roofing panels with durable exterior finishes.'),
  ('Roofing Shingles', 'shingles', 'Multi-layered stone-coated roofing shingles for premium residential and commercial roofs.'),
  ('Corrugated Sheets', 'corrugated-sheets', 'Traditional corrugated roofing sheets for residential, commercial and industrial structures.'),
  ('Ridge Caps & Apex', 'ridge-caps', 'Roofing ridge and apex components for weatherproof roof junctions.'),
  ('Trimmers & Gutters', 'trimmers-and-gutters', 'Valley gutters, roof trimmers and associated drainage components.'),
  ('Parapets & Flashing', 'parapets', 'Parapet cappings, flashing and perimeter roofing components.'),
  ('Accessories & Fasteners', 'accessories', 'Roofing screws, waterproofing tapes, sealants and related accessories.'),
  ('Roll Forming Services', 'roll-forming', 'Custom continuous roll forming of roofing sheets to specified lengths and profiles.'),
  ('Bending & Fabrication', 'bending-services', 'CNC bending, folding, curving and custom metal fabrication services.')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 3. Upsert Products (17 Total)
INSERT INTO public.products (category_id, name, slug, description, base_price, min_order_quantity, is_active, product_type, unit, profile_kind)
VALUES
  -- 1. Premium Longspan Aluminium Roofing Sheet
  (
    (SELECT id FROM public.categories WHERE slug = 'roofing-sheets'),
    'Premium Longspan Aluminium Roofing Sheet',
    'premium-longspan-aluminium-roofing-sheet',
    'Industrial-grade continuous longspan roofing sheet designed for residential, commercial and industrial applications. Available in multiple thicknesses, colours and custom lengths.',
    5700,
    1,
    true,
    'dimensioned',
    'metre',
    'longspan'
  ),
  -- 2. Premium Metcopo Roofing Sheet
  (
    (SELECT id FROM public.categories WHERE slug = 'metcopo-roofing'),
    'Premium Metcopo Roofing Sheet',
    'premium-metcopo-roofing-sheet',
    'Tile-effect roofing sheet combining a traditional architectural appearance with lightweight profiled metal construction. Available in multiple thicknesses and colours.',
    6000,
    1,
    true,
    'dimensioned',
    'sqm',
    'metcoppo'
  ),
  -- 3. Premium Step Tile Roofing Sheet
  (
    (SELECT id FROM public.categories WHERE slug = 'step-tiles'),
    'Premium Step Tile Roofing Sheet',
    'premium-step-tile-roofing-sheet',
    'Stepped architectural roofing panel designed for residential and commercial roofing applications, with multiple thickness and colour options.',
    5800,
    1,
    true,
    'dimensioned',
    'sqm',
    'step-tile'
  ),
  -- 4. Heavy-Duty Corrugated Aluzinc Roofing Sheet
  (
    (SELECT id FROM public.categories WHERE slug = 'corrugated-sheets'),
    'Heavy-Duty Corrugated Aluzinc Roofing Sheet',
    'heavy-duty-corrugated-aluzinc-roofing-sheet',
    'Traditional corrugated roofing sheet suitable for industrial, commercial and utility structures. Made from high-tensile aluzinc steel.',
    3500,
    1,
    true,
    'dimensioned',
    'sqm',
    'corrugated'
  ),
  -- 5. Premium Stone-Coated Roofing Shingles
  (
    (SELECT id FROM public.categories WHERE slug = 'shingles'),
    'Premium Stone-Coated Roofing Shingles',
    'premium-stone-coated-roofing-shingles',
    'Stone-coated roofing shingles designed for premium residential and commercial roof applications.',
    8500,
    1,
    true,
    'dimensioned',
    'sqm',
    'shingle'
  ),
  -- 6. Aluminium Ridge Cap
  (
    (SELECT id FROM public.categories WHERE slug = 'ridge-caps'),
    'Aluminium Ridge Cap',
    'aluminium-ridge-cap',
    'Roofing ridge and apex component for weatherproof roof junctions.',
    5500,
    1,
    true,
    'standard',
    'piece',
    'ridge'
  ),
  -- 7. Aluminium Hip Ridge Cap
  (
    (SELECT id FROM public.categories WHERE slug = 'ridge-caps'),
    'Aluminium Hip Ridge Cap',
    'aluminium-hip-ridge-cap',
    'Aluminium hip ridge cap designed to seal angled hip roof intersections.',
    5500,
    1,
    true,
    'standard',
    'piece',
    'ridge'
  ),
  -- 8. Aluminium Upper Trimmer
  (
    (SELECT id FROM public.categories WHERE slug = 'trimmers-and-gutters'),
    'Aluminium Upper Trimmer',
    'aluminium-upper-trimmer',
    'Precision folded aluminium upper trimmer for weatherproof perimeter and roof transitions.',
    4500,
    1,
    true,
    'standard',
    'piece',
    'trimmer'
  ),
  -- 9. Aluminium Lower Trimmer
  (
    (SELECT id FROM public.categories WHERE slug = 'trimmers-and-gutters'),
    'Aluminium Lower Trimmer',
    'aluminium-lower-trimmer',
    'Aluminium lower trimmer for bottom-edge weather protection and rainwater run-off.',
    4500,
    1,
    true,
    'standard',
    'piece',
    'trimmer'
  ),
  -- 10. Aluminium Valley Gutter
  (
    (SELECT id FROM public.categories WHERE slug = 'trimmers-and-gutters'),
    'Aluminium Valley Gutter',
    'aluminium-valley-gutter',
    'Heavy-duty aluminium valley gutter channel designed for roof valley rainwater discharge.',
    6500,
    1,
    true,
    'standard',
    'piece',
    'gutter'
  ),
  -- 11. Aluminium Parapet Wall Capping
  (
    (SELECT id FROM public.categories WHERE slug = 'parapets'),
    'Aluminium Parapet Wall Capping',
    'aluminium-parapet-wall-capping',
    'Architectural aluminium parapet wall coping with drip edges for firewall moisture protection.',
    4500,
    1,
    true,
    'dimensioned',
    'metre',
    'flashing'
  ),
  -- 12. Custom Aluminium Roof Flashing
  (
    (SELECT id FROM public.categories WHERE slug = 'parapets'),
    'Custom Aluminium Roof Flashing',
    'custom-aluminium-roof-flashing',
    'Bespoke bent aluminium flashing tailored to custom angles and perimeter roof geometry.',
    4000,
    1,
    true,
    'dimensioned',
    'metre',
    'flashing'
  ),
  -- 13. EPDM Self-Drilling Roofing Screws
  (
    (SELECT id FROM public.categories WHERE slug = 'accessories'),
    'EPDM Self-Drilling Roofing Screws',
    'epdm-self-drilling-roofing-screws',
    'High-tensile self-drilling hex fasteners with UV-stabilized EPDM sealing washers for leakproof fixing.',
    12000,
    1,
    true,
    'standard',
    'bundle',
    'fastener'
  ),
  -- 14. Butyl Waterproof Roofing Tape
  (
    (SELECT id FROM public.categories WHERE slug = 'accessories'),
    'Butyl Waterproof Roofing Tape',
    'butyl-waterproof-roofing-tape',
    'Self-adhesive heavy-duty butyl rubber waterproof tape for flashing, overlap and gutter sealing.',
    7500,
    1,
    true,
    'standard',
    'roll',
    'fastener'
  ),
  -- 15. Weatherproof Roofing Sealant
  (
    (SELECT id FROM public.categories WHERE slug = 'accessories'),
    'Weatherproof Roofing Sealant',
    'weatherproof-roofing-sealant',
    'High-performance elastomeric weatherproof joint sealant formulated for metal roof sealing.',
    5500,
    1,
    true,
    'standard',
    'piece',
    'fastener'
  ),
  -- 16. Custom Roofing Sheet Roll Forming
  (
    (SELECT id FROM public.categories WHERE slug = 'roll-forming'),
    'Custom Roofing Sheet Roll Forming',
    'custom-roofing-sheet-roll-forming',
    'Custom continuous roll forming of roofing sheets to specified lengths and profiles on-site or in-factory.',
    0,
    1,
    true,
    'service',
    'service',
    'roll-forming'
  ),
  -- 17. CNC Bending & Metal Fabrication
  (
    (SELECT id FROM public.categories WHERE slug = 'bending-services'),
    'CNC Bending & Metal Fabrication',
    'cnc-bending-metal-fabrication',
    'Precision CNC press brake sheet bending, curving, folding, and custom architectural metal fabrication.',
    0,
    1,
    true,
    'service',
    'service',
    'bending'
  )
ON CONFLICT (slug) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_price = EXCLUDED.base_price,
  min_order_quantity = EXCLUDED.min_order_quantity,
  is_active = EXCLUDED.is_active,
  product_type = EXCLUDED.product_type,
  unit = EXCLUDED.unit,
  profile_kind = EXCLUDED.profile_kind;

-- 4. Upsert Product Variants (48 Total)
INSERT INTO public.product_variants (product_id, name, sku, price_override, stock_quantity, is_active)
VALUES
  -- 1. Premium Longspan Aluminium Roofing Sheet (5 Variants)
  ((SELECT id FROM public.products WHERE slug = 'premium-longspan-aluminium-roofing-sheet'), '0.45mm / Wine Red', 'LS-045-WR', 5700, 2000, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-longspan-aluminium-roofing-sheet'), '0.50mm / Wine Red', 'LS-050-WR', 6400, 2000, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-longspan-aluminium-roofing-sheet'), '0.55mm / Slate Grey', 'LS-055-SG', 7500, 2000, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-longspan-aluminium-roofing-sheet'), '0.60mm / Charcoal', 'LS-060-CH', 8900, 1500, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-longspan-aluminium-roofing-sheet'), '0.70mm / Charcoal', 'LS-070-CH', 12500, 1000, true),

  -- 2. Premium Metcopo Roofing Sheet (4 Variants)
  ((SELECT id FROM public.products WHERE slug = 'premium-metcopo-roofing-sheet'), '0.45mm / Wine Red', 'MC-045-WR', 6000, 1500, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-metcopo-roofing-sheet'), '0.55mm / Charcoal', 'MC-055-CH', 7200, 1500, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-metcopo-roofing-sheet'), '0.55mm / Forest Green', 'MC-055-FG', 7200, 1500, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-metcopo-roofing-sheet'), '0.60mm / Slate Grey', 'MC-060-SG', 9200, 1000, true),

  -- 3. Premium Step Tile Roofing Sheet (4 Variants)
  ((SELECT id FROM public.products WHERE slug = 'premium-step-tile-roofing-sheet'), '0.45mm / Wine Red', 'ST-045-WR', 5800, 1500, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-step-tile-roofing-sheet'), '0.50mm / Chocolate', 'ST-050-CH', 6400, 1500, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-step-tile-roofing-sheet'), '0.55mm / Slate Grey', 'ST-055-SG', 7200, 1500, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-step-tile-roofing-sheet'), '0.60mm / Forest Green', 'ST-060-FG', 9200, 1000, true),

  -- 4. Heavy-Duty Corrugated Aluzinc Roofing Sheet (3 Variants)
  ((SELECT id FROM public.products WHERE slug = 'heavy-duty-corrugated-aluzinc-roofing-sheet'), '0.40mm / Silver', 'CS-040-SL', 3500, 2000, true),
  ((SELECT id FROM public.products WHERE slug = 'heavy-duty-corrugated-aluzinc-roofing-sheet'), '0.45mm / Silver', 'CS-045-SL', 4000, 2000, true),
  ((SELECT id FROM public.products WHERE slug = 'heavy-duty-corrugated-aluzinc-roofing-sheet'), '0.45mm / Blue', 'CS-045-BL', 4300, 1500, true),

  -- 5. Premium Stone-Coated Roofing Shingles (3 Variants)
  ((SELECT id FROM public.products WHERE slug = 'premium-stone-coated-roofing-shingles'), 'Classic / Charcoal', 'SH-CLS-CH', 8500, 1000, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-stone-coated-roofing-shingles'), 'Classic / Terracotta', 'SH-CLS-TR', 8500, 1000, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-stone-coated-roofing-shingles'), 'Luxury / Black', 'SH-LUX-BK', 10500, 800, true),

  -- 6. Aluminium Ridge Cap (3 Variants)
  ((SELECT id FROM public.products WHERE slug = 'aluminium-ridge-cap'), '0.45mm / Wine Red / 2m', 'RC-045-WR-2M', 5500, 300, true),
  ((SELECT id FROM public.products WHERE slug = 'aluminium-ridge-cap'), '0.50mm / Charcoal / 2m', 'RC-050-CH-2M', 6500, 300, true),
  ((SELECT id FROM public.products WHERE slug = 'aluminium-ridge-cap'), '0.55mm / Slate Grey / 2m', 'RC-055-SG-2M', 7500, 300, true),

  -- 7. Aluminium Hip Ridge Cap (3 Variants)
  ((SELECT id FROM public.products WHERE slug = 'aluminium-hip-ridge-cap'), '0.45mm / 2m', 'HRC-045-2M', 5500, 300, true),
  ((SELECT id FROM public.products WHERE slug = 'aluminium-hip-ridge-cap'), '0.50mm / 2m', 'HRC-050-2M', 6500, 300, true),
  ((SELECT id FROM public.products WHERE slug = 'aluminium-hip-ridge-cap'), '0.55mm / 2m', 'HRC-055-2M', 7500, 300, true),

  -- 8. Aluminium Upper Trimmer (3 Variants)
  ((SELECT id FROM public.products WHERE slug = 'aluminium-upper-trimmer'), '0.45mm / 2m', 'UT-045-2M', 4500, 250, true),
  ((SELECT id FROM public.products WHERE slug = 'aluminium-upper-trimmer'), '0.50mm / 2m', 'UT-050-2M', 5200, 250, true),
  ((SELECT id FROM public.products WHERE slug = 'aluminium-upper-trimmer'), '0.55mm / 2m', 'UT-055-2M', 6000, 250, true),

  -- 9. Aluminium Lower Trimmer (3 Variants)
  ((SELECT id FROM public.products WHERE slug = 'aluminium-lower-trimmer'), '0.45mm / 2m', 'LT-045-2M', 4500, 250, true),
  ((SELECT id FROM public.products WHERE slug = 'aluminium-lower-trimmer'), '0.50mm / 2m', 'LT-050-2M', 5200, 250, true),
  ((SELECT id FROM public.products WHERE slug = 'aluminium-lower-trimmer'), '0.55mm / 2m', 'LT-055-2M', 6000, 250, true),

  -- 10. Aluminium Valley Gutter (3 Variants)
  ((SELECT id FROM public.products WHERE slug = 'aluminium-valley-gutter'), '0.45mm / 2m', 'VG-045-2M', 6500, 200, true),
  ((SELECT id FROM public.products WHERE slug = 'aluminium-valley-gutter'), '0.50mm / 2m', 'VG-050-2M', 7500, 200, true),
  ((SELECT id FROM public.products WHERE slug = 'aluminium-valley-gutter'), '0.55mm / 2m', 'VG-055-2M', 8500, 200, true),

  -- 11. Aluminium Parapet Wall Capping (3 Variants)
  ((SELECT id FROM public.products WHERE slug = 'aluminium-parapet-wall-capping'), '0.45mm', 'PC-045', 4500, 400, true),
  ((SELECT id FROM public.products WHERE slug = 'aluminium-parapet-wall-capping'), '0.50mm', 'PC-050', 5200, 400, true),
  ((SELECT id FROM public.products WHERE slug = 'aluminium-parapet-wall-capping'), '0.55mm', 'PC-055', 6000, 400, true),

  -- 12. Custom Aluminium Roof Flashing (2 Variants)
  ((SELECT id FROM public.products WHERE slug = 'custom-aluminium-roof-flashing'), 'Standard / 0.45mm', 'RF-045-STD', 4000, 300, true),
  ((SELECT id FROM public.products WHERE slug = 'custom-aluminium-roof-flashing'), 'Heavy Duty / 0.55mm', 'RF-055-HD', 5500, 300, true),

  -- 13. EPDM Self-Drilling Roofing Screws (3 Variants)
  ((SELECT id FROM public.products WHERE slug = 'epdm-self-drilling-roofing-screws'), '5.5 x 50mm / 100 pieces', 'RS-0550-100', 12000, 500, true),
  ((SELECT id FROM public.products WHERE slug = 'epdm-self-drilling-roofing-screws'), '5.5 x 65mm / 100 pieces', 'RS-0565-100', 14000, 500, true),
  ((SELECT id FROM public.products WHERE slug = 'epdm-self-drilling-roofing-screws'), '5.5 x 75mm / 100 pieces', 'RS-0575-100', 16000, 500, true),

  -- 14. Butyl Waterproof Roofing Tape (3 Variants)
  ((SELECT id FROM public.products WHERE slug = 'butyl-waterproof-roofing-tape'), '50mm x 10m', 'BT-5010', 7500, 400, true),
  ((SELECT id FROM public.products WHERE slug = 'butyl-waterproof-roofing-tape'), '75mm x 10m', 'BT-7510', 10000, 400, true),
  ((SELECT id FROM public.products WHERE slug = 'butyl-waterproof-roofing-tape'), '100mm x 10m', 'BT-10010', 13000, 400, true),

  -- 15. Weatherproof Roofing Sealant (3 Variants)
  ((SELECT id FROM public.products WHERE slug = 'weatherproof-roofing-sealant'), '300ml / Clear', 'RS-300-CL', 5500, 500, true),
  ((SELECT id FROM public.products WHERE slug = 'weatherproof-roofing-sealant'), '300ml / Grey', 'RS-300-GY', 5500, 500, true),
  ((SELECT id FROM public.products WHERE slug = 'weatherproof-roofing-sealant'), '300ml / Black', 'RS-300-BK', 5500, 500, true),

  -- 16. Custom Roofing Sheet Roll Forming (1 Variant)
  ((SELECT id FROM public.products WHERE slug = 'custom-roofing-sheet-roll-forming'), 'Custom On-Site/Factory Roll Forming Service', 'SRV-ROLL-FORM', 0, 0, true),

  -- 17. CNC Bending & Metal Fabrication (1 Variant)
  ((SELECT id FROM public.products WHERE slug = 'cnc-bending-metal-fabrication'), 'Custom CNC Metal Bending & Fabrication Service', 'SRV-CNC-BEND', 0, 0, true)
ON CONFLICT (sku) DO UPDATE SET
  product_id = EXCLUDED.product_id,
  name = EXCLUDED.name,
  price_override = EXCLUDED.price_override,
  stock_quantity = EXCLUDED.stock_quantity,
  is_active = EXCLUDED.is_active;

-- ==============================================================================
-- 5. Seed Category Images (Supabase Storage)
-- ==============================================================================
DELETE FROM public.category_images WHERE storage_path IN (
  'long_span.jpg',
  'black_metcopo.jpg',
  'step-tiles.jpg',
  'corrugated-sheets.jpg',
  'shingles.jpg',
  'gutters.jpg',
  'roofing-accessories.jpg',
  'roll-forming.jpg',
  'roof_bending.jpg'
);

INSERT INTO public.category_images (category_id, storage_path, alt_text, display_order, is_primary)
VALUES
  ((SELECT id FROM public.categories WHERE slug = 'roofing-sheets'), 'long_span.jpg', 'Roofing Sheets Category Cover', 0, true),
  ((SELECT id FROM public.categories WHERE slug = 'metcopo-roofing'), 'black_metcopo.jpg', 'Metcopo Roofing Category Cover', 0, true),
  ((SELECT id FROM public.categories WHERE slug = 'step-tiles'), 'step-tiles.jpg', 'Step Tiles Category Cover', 0, true),
  ((SELECT id FROM public.categories WHERE slug = 'corrugated-sheets'), 'corrugated-sheets.jpg', 'Corrugated Sheets Category Cover', 0, true),
  ((SELECT id FROM public.categories WHERE slug = 'shingles'), 'shingles.jpg', 'Roofing Shingles Category Cover', 0, true),
  ((SELECT id FROM public.categories WHERE slug = 'trimmers-and-gutters'), 'gutters.jpg', 'Trimmers & Gutters Category Cover', 0, true),
  ((SELECT id FROM public.categories WHERE slug = 'accessories'), 'roofing-accessories.jpg', 'Accessories & Fasteners Category Cover', 0, true),
  ((SELECT id FROM public.categories WHERE slug = 'roll-forming'), 'roll-forming.jpg', 'Roll Forming Services Category Cover', 0, true),
  ((SELECT id FROM public.categories WHERE slug = 'bending-services'), 'roof_bending.jpg', 'Bending & Fabrication Services Category Cover', 0, true)
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 6. Seed Product Images (Supabase Storage)
-- ==============================================================================
DELETE FROM public.product_images WHERE storage_path IN (
  'long_span.jpg',
  'black_metcopo.jpg',
  'step-tiles.jpg',
  'corrugated-sheets.jpg',
  'shingles.jpg',
  'gutters.jpg',
  'roofing-accessories.jpg',
  'roll-forming.jpg',
  'roll-forming1.jpg',
  'roof_bending.jpg'
);

INSERT INTO public.product_images (product_id, storage_path, alt_text, role, width, height, bytes, mime_type, source, license, permission_status, display_order, is_primary)
VALUES
  ((SELECT id FROM public.products WHERE slug = 'premium-longspan-aluminium-roofing-sheet'), 'long_span.jpg', 'Photograph of Premium Longspan Aluminium Roofing Sheet', 'main', 1800, 1200, 2558, 'image/jpeg', 'supabase_storage', 'proprietary', 'approved', 0, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-metcopo-roofing-sheet'), 'black_metcopo.jpg', 'Photograph of Premium Metcopo Roofing Sheet', 'main', 1800, 1200, 18903, 'image/jpeg', 'supabase_storage', 'proprietary', 'approved', 0, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-step-tile-roofing-sheet'), 'step-tiles.jpg', 'Photograph of Premium Step Tile Roofing Sheet', 'main', 1800, 1200, 50916, 'image/jpeg', 'supabase_storage', 'proprietary', 'approved', 0, true),
  ((SELECT id FROM public.products WHERE slug = 'heavy-duty-corrugated-aluzinc-roofing-sheet'), 'corrugated-sheets.jpg', 'Photograph of Heavy-Duty Corrugated Aluzinc Roofing Sheet', 'main', 1800, 1200, 24516, 'image/jpeg', 'supabase_storage', 'proprietary', 'approved', 0, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-stone-coated-roofing-shingles'), 'shingles.jpg', 'Photograph of Premium Stone-Coated Roofing Shingles', 'main', 1800, 1200, 34166, 'image/jpeg', 'supabase_storage', 'proprietary', 'approved', 0, true),
  ((SELECT id FROM public.products WHERE slug = 'aluminium-valley-gutter'), 'gutters.jpg', 'Photograph of Aluminium Valley Gutter', 'main', 1800, 1200, 14714, 'image/jpeg', 'supabase_storage', 'proprietary', 'approved', 0, true),
  ((SELECT id FROM public.products WHERE slug = 'aluminium-upper-trimmer'), 'gutters.jpg', 'Photograph of Aluminium Upper Trimmer', 'main', 1800, 1200, 14714, 'image/jpeg', 'supabase_storage', 'proprietary', 'approved', 0, true),
  ((SELECT id FROM public.products WHERE slug = 'aluminium-lower-trimmer'), 'gutters.jpg', 'Photograph of Aluminium Lower Trimmer', 'main', 1800, 1200, 14714, 'image/jpeg', 'supabase_storage', 'proprietary', 'approved', 0, true),
  ((SELECT id FROM public.products WHERE slug = 'epdm-self-drilling-roofing-screws'), 'roofing-accessories.jpg', 'Photograph of EPDM Self-Drilling Roofing Screws', 'main', 1800, 1200, 26355, 'image/jpeg', 'supabase_storage', 'proprietary', 'approved', 0, true),
  ((SELECT id FROM public.products WHERE slug = 'butyl-waterproof-roofing-tape'), 'roofing-accessories.jpg', 'Photograph of Butyl Waterproof Roofing Tape', 'main', 1800, 1200, 26355, 'image/jpeg', 'supabase_storage', 'proprietary', 'approved', 0, true),
  ((SELECT id FROM public.products WHERE slug = 'weatherproof-roofing-sealant'), 'roofing-accessories.jpg', 'Photograph of Weatherproof Roofing Sealant', 'main', 1800, 1200, 26355, 'image/jpeg', 'supabase_storage', 'proprietary', 'approved', 0, true),
  ((SELECT id FROM public.products WHERE slug = 'custom-roofing-sheet-roll-forming'), 'roll-forming.jpg', 'Photograph of Custom Roofing Sheet Roll Forming', 'main', 1800, 1200, 37934, 'image/jpeg', 'supabase_storage', 'proprietary', 'approved', 0, true),
  ((SELECT id FROM public.products WHERE slug = 'custom-roofing-sheet-roll-forming'), 'roll-forming1.jpg', 'Process detail of Custom Roofing Sheet Roll Forming', 'detail', 1800, 1200, 37512, 'image/jpeg', 'supabase_storage', 'proprietary', 'approved', 1, false),
  ((SELECT id FROM public.products WHERE slug = 'cnc-bending-metal-fabrication'), 'roof_bending.jpg', 'Photograph of CNC Bending & Metal Fabrication', 'main', 1800, 1200, 16785, 'image/jpeg', 'supabase_storage', 'proprietary', 'approved', 0, true)
ON CONFLICT DO NOTHING;


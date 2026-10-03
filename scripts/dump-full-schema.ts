import { Client } from 'pg';
import '../src/config/load-env-file.ts';
import { writeFile } from 'node:fs/promises';

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error('SUPABASE_DB_URL is required');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    let sql = `-- ==============================================================================\n`;
    sql += `-- COMPLETE PRODUCTION DATABASE INITIALIZATION SCRIPT\n`;
    sql += `-- Run this in your Production Supabase SQL Editor to initialize all tables & data\n`;
    sql += `-- ==============================================================================\n\n`;

    sql += `-- Extensions\n`;
    sql += `CREATE EXTENSION IF NOT EXISTS "pgcrypto";\n\n`;

    // 1. Enum Types
    const enumsRes = await client.query(`
      SELECT 
        t.typname as enum_name,
        string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) as enum_values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname;
    `);

    sql += `-- 1. Custom Enum Types\n`;
    for (const row of enumsRes.rows) {
      sql += `DO $$ BEGIN\n`;
      sql += `  CREATE TYPE public.${row.enum_name} AS ENUM (${row.enum_values});\n`;
      sql += `EXCEPTION WHEN duplicate_object THEN NULL;\n`;
      sql += `END $$;\n\n`;
    }

    // 2. Query all table DDL components
    // Base tables in dependency order:
    const tableOrder = [
      'profiles',
      'categories',
      'products',
      'product_variants',
      'product_images',
      'category_images',
      'orders',
      'order_items',
      'cart_items',
      'fabrication_requests',
      'sessions',
      'audit_log',
      'email_outbox',
    ];

    sql += `-- 2. Tables & Constraints\n\n`;

    for (const tableName of tableOrder) {
      // Get columns
      const colsRes = await client.query(`
        SELECT 
          column_name,
          udt_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [tableName]);

      if (colsRes.rows.length === 0) continue;

      sql += `CREATE TABLE IF NOT EXISTS public.${tableName} (\n`;
      const colDefs = colsRes.rows.map(col => {
        let typeStr = col.udt_name;
        if (col.data_type === 'USER-DEFINED') {
          typeStr = `public.${col.udt_name}`;
        } else if (col.data_type === 'ARRAY') {
          typeStr = `${col.udt_name.replace(/^_/, '')}[]`;
        } else if (col.data_type === 'character varying') {
          typeStr = col.character_maximum_length ? `VARCHAR(${col.character_maximum_length})` : 'VARCHAR';
        } else if (col.data_type === 'timestamp with time zone') {
          typeStr = 'TIMESTAMPTZ';
        } else if (col.data_type === 'timestamp without time zone') {
          typeStr = 'TIMESTAMP';
        }

        let def = `  ${col.column_name} ${typeStr}`;
        if (col.column_default) {
          def += ` DEFAULT ${col.column_default}`;
        }
        if (col.is_nullable === 'NO') {
          def += ` NOT NULL`;
        }
        return def;
      });

      // Get primary key
      const pkRes = await client.query(`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = $1;
      `, [tableName]);

      if (pkRes.rows.length > 0) {
        const pkCols = pkRes.rows.map(r => r.column_name).join(', ');
        colDefs.push(`  PRIMARY KEY (${pkCols})`);
      }

      sql += colDefs.join(',\n') + '\n);\n\n';
    }

    // 3. Sequences
    sql += `-- 3. Sequences\n`;
    sql += `CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1001;\n\n`;

    // 4. Foreign Keys
    sql += `-- 4. Foreign Key Constraints\n`;
    const fksRes = await client.query(`
      SELECT
        tc.table_name,
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
    `);

    for (const fk of fksRes.rows) {
      if (!tableOrder.includes(fk.table_name) || !tableOrder.includes(fk.foreign_table_name)) continue;
      sql += `DO $$ BEGIN\n`;
      sql += `  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${fk.constraint_name}') THEN\n`;
      sql += `    ALTER TABLE public.${fk.table_name} ADD CONSTRAINT ${fk.constraint_name} FOREIGN KEY (${fk.column_name}) REFERENCES public.${fk.foreign_table_name}(${fk.foreign_column_name}) ON DELETE ${fk.delete_rule};\n`;
      sql += `  END IF;\n`;
      sql += `END $$;\n\n`;
    }

    // 5. Indexes
    sql += `-- 5. Indexes\n`;
    const idxRes = await client.query(`
      SELECT indexdef, tablename
      FROM pg_indexes
      WHERE schemaname = 'public' AND indexname NOT LIKE '%_pkey';
    `);

    for (const idx of idxRes.rows) {
      if (!tableOrder.includes(idx.tablename)) continue;
      sql += `${idx.indexdef};\n`;
    }
    sql += '\n';

    // 6. Append create_order RPC, permissions and reload
    sql += `-- 6. Stored Procedures & Functions\n`;
    sql += `CREATE OR REPLACE FUNCTION public.create_order(
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
$$;\n\n`;

    // 7. Permissions & Grants
    sql += `-- 7. Schema Permissions & Privileges\n`;
    sql += `GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, postgres;\n`;
    sql += `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role, postgres;\n`;
    sql += `GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role, postgres;\n`;
    sql += `GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role, postgres;\n\n`;
    sql += `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role, postgres;\n`;
    sql += `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role, postgres;\n`;
    sql += `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role, postgres;\n\n`;

    sql += `GRANT EXECUTE ON FUNCTION public.create_order(UUID, JSONB, JSONB) TO service_role;\n`;
    sql += `GRANT EXECUTE ON FUNCTION public.create_order(UUID, JSONB, JSONB) TO authenticated;\n`;
    sql += `GRANT EXECUTE ON FUNCTION public.create_order(UUID, JSONB, JSONB) TO anon;\n\n`;

    // 8. RLS
    sql += `-- 8. Enable Row Level Security\n`;
    for (const tableName of tableOrder) {
      sql += `ALTER TABLE IF EXISTS public.${tableName} ENABLE ROW LEVEL SECURITY;\n`;
    }
    sql += '\n';

    // 9. Reload PostgREST
    sql += `-- 9. Reload PostgREST Schema Cache\n`;
    sql += `NOTIFY pgrst, 'reload schema';\n`;
    sql += `NOTIFY pgrst, 'reload config';\n`;

    await writeFile('scripts/init-production-db.sql', sql, 'utf8');
    console.log('Successfully generated scripts/init-production-db.sql');
  } finally {
    await client.end();
  }
}

main().catch(console.error);

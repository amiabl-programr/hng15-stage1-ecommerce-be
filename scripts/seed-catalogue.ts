import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';

import '../src/config/load-env-file.ts';
import type { Database } from '../src/config/database.types.ts';

const CATEGORIES = [
  { id: 'c0000000-0000-4000-8000-000000000001', name: 'Roofing Sheets', slug: 'roofing-sheets', description: 'Industrial & residential continuous longspan aluminium sheets available in custom lengths.' },
  { id: 'c0000000-0000-4000-8000-000000000002', name: 'Metcopo Roofing', slug: 'metcopo-roofing', description: 'Classic European clay tile aesthetics engineered in high-tensile aluzinc steel.' },
  { id: 'c0000000-0000-4000-8000-000000000003', name: 'Step Tiles', slug: 'step-tiles', description: 'Stepped architectural panels with anti-fade exterior resin finishes.' },
  { id: 'c0000000-0000-4000-8000-000000000004', name: 'Roofing Shingles', slug: 'shingles', description: 'Multi-layered volcanic basalt stone-coated asphalt tiles for luxury roofs.' },
  { id: 'c0000000-0000-4000-8000-000000000005', name: 'Ridge Caps & Apex', slug: 'ridge-caps', description: 'Heavy-gauge apex caps to seal junctions against driving rainfall.' },
  { id: 'c0000000-0000-4000-8000-000000000006', name: 'Trimmers & Gutters', slug: 'trimmers-and-parapets', description: 'Valley gutters, flashing trimmers, and parapet perimeter wall copings.' },
  { id: 'c0000000-0000-4000-8000-000000000007', name: 'Parapets & Flashing', slug: 'parapets', description: 'Double drip edge architectural wall cappings for firewall perimeters.' },
  { id: 'c0000000-0000-4000-8000-000000000008', name: 'Corrugated Sheets', slug: 'corrugated-sheets', description: 'Traditional heavy-gauge sinusoidal steel sheets for industrial structures.' },
  { id: 'c0000000-0000-4000-8000-000000000009', name: 'Roll Forming Services', slug: 'roll-forming', description: 'Computerized on-site continuous roll forming rigs up to 30 metres unbroken.' },
  { id: 'c0000000-0000-4000-8000-000000000010', name: 'Bending & Fabrication', slug: 'bending-services', description: 'CNC press brake metal folding, arch curving, and bespoke trims.' },
  { id: 'c0000000-0000-4000-8000-000000000011', name: 'Accessories & Fasteners', slug: 'accessories', description: 'EPDM self-drilling hex fasteners, butyl waterproof tapes, and sealants.' },
];

const PRODUCTS: Database['public']['Tables']['products']['Insert'][] = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    category_id: 'c0000000-0000-4000-8000-000000000001',
    name: 'Premium Longspan Aluminium Roofing Sheet',
    slug: 'premium-longspan-aluminium-roofing-sheet',
    description: 'Industrial & residential continuous longspan aluminium sheets available in custom lengths. Aluminium Alloy 3003, 900mm effective cover width, 25-year warranty, 85% solar reflectance.',
    base_price: 3800,
    min_order_quantity: 1,
    is_active: true,
    product_type: 'dimensioned',
    unit: 'metre',
    profile_kind: 'longspan',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    category_id: 'c0000000-0000-4000-8000-000000000002',
    name: 'Metcopo Steptile Profile Sheet',
    slug: 'metcopo-steptile-profile-sheet',
    description: 'Classic European clay tile aesthetics engineered in high-tensile aluzinc steel. Aluzinc Steel, 1000mm cover width, 28mm step height, 30-year warranty.',
    base_price: 4200,
    min_order_quantity: 1,
    is_active: true,
    product_type: 'dimensioned',
    unit: 'metre',
    profile_kind: 'metcoppo',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    category_id: 'c0000000-0000-4000-8000-000000000004',
    name: 'Stone-Coated Shake Shingle Tile',
    slug: 'stone-coated-shake-shingle-tile',
    description: 'Multi-layered volcanic basalt stone-coated asphalt tiles for luxury roofs. Galvalume steel core with natural volcanic basalt stone granules, 1340mm × 420mm, 50-year warranty.',
    base_price: 5400,
    min_order_quantity: 1,
    is_active: true,
    product_type: 'standard',
    unit: 'piece',
    profile_kind: 'shingle',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000004',
    category_id: 'c0000000-0000-4000-8000-000000000005',
    name: 'Heavy-Gauge Ridged Apex Cap (2m Length)',
    slug: 'heavy-gauge-ridged-apex-cap',
    description: 'Heavy-gauge apex caps to seal junctions against driving rainfall. Heavy-gauge aluminium/aluzinc, 2000mm length, 450mm girth, folded weather return lips.',
    base_price: 2800,
    min_order_quantity: 1,
    is_active: true,
    product_type: 'standard',
    unit: 'piece',
    profile_kind: 'ridge',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000005',
    category_id: 'c0000000-0000-4000-8000-000000000009',
    name: 'On-Site Continuous Roll Forming Service',
    slug: 'on-site-continuous-roll-forming-service',
    description: 'Computerized on-site continuous roll forming rigs up to 30 metres unbroken. Mobile computerized hydraulic rig deployed to construction sites, 4 certified engineers, up to 5,000m daily extrusion capacity (up to 30m seamless unbroken sheets).',
    base_price: 25000,
    min_order_quantity: 1,
    is_active: true,
    product_type: 'service',
    unit: 'service',
    profile_kind: 'roll-forming',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000006',
    category_id: 'c0000000-0000-4000-8000-000000000010',
    name: 'Custom CNC Sheet Bending & Curving Service',
    slug: 'custom-cnc-sheet-bending-and-curving-service',
    description: 'CNC press brake metal folding, arch curving, and bespoke trims. CNC press brake folding up to 1.2mm thickness, ±0.5° angular tolerance, arch curving & valley trims, 24–48hr turnaround.',
    base_price: 850,
    min_order_quantity: 1,
    is_active: true,
    product_type: 'service',
    unit: 'metre',
    profile_kind: 'bending',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000007',
    category_id: 'c0000000-0000-4000-8000-000000000011',
    name: 'Self-Drilling Hex Roofing Screws (Pack of 100)',
    slug: 'self-drilling-hex-roofing-screws-pack-100',
    description: 'EPDM self-drilling hex fasteners, butyl waterproof tapes, and sealants. Case-hardened carbon steel (12 × 55mm), high-temp UV-stabilized EPDM washer, Ruspert anti-corrosion coating.',
    base_price: 6500,
    min_order_quantity: 1,
    is_active: true,
    product_type: 'standard',
    unit: 'bundle',
    profile_kind: 'fastener',
  },
];

const VARIANTS: Database['public']['Tables']['product_variants']['Insert'][] = [
  { id: 'b0000000-0000-4000-8000-000000000001', product_id: 'a0000000-0000-4000-8000-000000000001', name: '0.45mm / Wine Red (Gloss)', sku: 'LS-045-WR', price_override: 3800, stock_quantity: 10000, is_active: true },
  { id: 'b0000000-0000-4000-8000-000000000002', product_id: 'a0000000-0000-4000-8000-000000000001', name: '0.50mm / Wine Red (Gloss)', sku: 'LS-050-WR', price_override: 4200, stock_quantity: 10000, is_active: true },
  { id: 'b0000000-0000-4000-8000-000000000003', product_id: 'a0000000-0000-4000-8000-000000000001', name: '0.55mm / Slate Grey (Matte)', sku: 'LS-055-SG', price_override: 4700, stock_quantity: 10000, is_active: true },
  { id: 'b0000000-0000-4000-8000-000000000004', product_id: 'a0000000-0000-4000-8000-000000000001', name: '0.50mm / Forest Green (Gloss)', sku: 'LS-050-FG', price_override: 4200, stock_quantity: 10000, is_active: true },
  { id: 'b0000000-0000-4000-8000-000000000005', product_id: 'a0000000-0000-4000-8000-000000000002', name: '0.50mm / Traffic Blue (Gloss)', sku: 'MC-050-TB', price_override: 4200, stock_quantity: 8000, is_active: true },
  { id: 'b0000000-0000-4000-8000-000000000006', product_id: 'a0000000-0000-4000-8000-000000000002', name: '0.55mm / Charcoal Black (Matte)', sku: 'MC-055-CB', price_override: 4800, stock_quantity: 8000, is_active: true },
  { id: 'b0000000-0000-4000-8000-000000000007', product_id: 'a0000000-0000-4000-8000-000000000003', name: 'Basalt Charcoal Black', sku: 'SH-ST-BLK', price_override: 5400, stock_quantity: 5000, is_active: true },
  { id: 'b0000000-0000-4000-8000-000000000008', product_id: 'a0000000-0000-4000-8000-000000000003', name: 'Spanish Coffee Brown', sku: 'SH-ST-BRN', price_override: 5400, stock_quantity: 5000, is_active: true },
  { id: 'b0000000-0000-4000-8000-000000000009', product_id: 'a0000000-0000-4000-8000-000000000004', name: 'Standard 2m Length (Heavy-Gauge)', sku: 'RC-APEX-2M', price_override: 2800, stock_quantity: 2500, is_active: true },
  { id: 'b0000000-0000-4000-8000-000000000010', product_id: 'a0000000-0000-4000-8000-000000000005', name: 'On-Site Mobile Rig Deployment', sku: 'SRV-ROLL-FORM', price_override: 25000, stock_quantity: 999, is_active: true },
  { id: 'b0000000-0000-4000-8000-000000000011', product_id: 'a0000000-0000-4000-8000-000000000006', name: 'CNC Sheet Bending & Curving', sku: 'SRV-CNC-BEND', price_override: 850, stock_quantity: 999, is_active: true },
  { id: 'b0000000-0000-4000-8000-000000000012', product_id: 'a0000000-0000-4000-8000-000000000007', name: 'Pack of 100 Screws with EPDM Washers', sku: 'ACC-HEX-100', price_override: 6500, stock_quantity: 1200, is_active: true },
];

async function seedViaPostgres(connectionString: string): Promise<void> {
  const seedSqlPath = resolve('supabase/seed.sql');
  const sql = await readFile(seedSqlPath, 'utf8');

  const client = new Client({ connectionString });
  await client.connect();

  try {
    console.log('Applying catalogue seeds to Supabase PostgreSQL database...');
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    console.log('Successfully seeded 11 categories and 7 products with variants via PostgreSQL!');
  } catch (error) {
    await client.query('rollback');
    console.error('Failed to seed catalogue via PostgreSQL:', error);
    throw error;
  } finally {
    await client.end();
  }
}

async function seedViaSupabaseClient(url: string, serviceKey: string): Promise<void> {
  const supabase = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  console.log('Applying catalogue seeds via Supabase API...');

  // 1. Categories
  const { error: catErr } = await supabase.from('categories').upsert(CATEGORIES, { onConflict: 'slug' });
  if (catErr) throw new Error(`Category seed failed: ${catErr.message}`);

  // 2. Products
  const { error: prodErr } = await supabase.from('products').upsert(PRODUCTS, { onConflict: 'slug' });
  if (prodErr) throw new Error(`Product seed failed: ${prodErr.message}`);

  // 3. Variants
  const { error: varErr } = await supabase.from('product_variants').upsert(VARIANTS, { onConflict: 'sku' });
  if (varErr) throw new Error(`Variant seed failed: ${varErr.message}`);

  console.log('Successfully seeded 11 categories and 7 products with variants via Supabase API!');
}

async function main(): Promise<void> {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (connectionString) {
    await seedViaPostgres(connectionString);
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (supabaseUrl && serviceKey) {
    await seedViaSupabaseClient(supabaseUrl, serviceKey);
    return;
  }

  console.log('No DB credentials provided (SUPABASE_DB_URL, DATABASE_URL, or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).');
  console.log('Seed SQL is ready in supabase/seed.sql');
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

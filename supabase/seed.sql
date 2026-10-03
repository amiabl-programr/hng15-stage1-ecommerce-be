-- ==============================================================================
-- Catalogue Seed: 11 Categories and 7 Products with Variants
-- ==============================================================================

-- 1. Insert Categories (11 Total)
INSERT INTO public.categories (name, slug, description)
VALUES
  ('Roofing Sheets', 'roofing-sheets', 'Industrial & residential continuous longspan aluminium sheets available in custom lengths.'),
  ('Metcopo Roofing', 'metcopo-roofing', 'Classic European clay tile aesthetics engineered in high-tensile aluzinc steel.'),
  ('Step Tiles', 'step-tiles', 'Stepped architectural panels with anti-fade exterior resin finishes.'),
  ('Roofing Shingles', 'shingles', 'Multi-layered volcanic basalt stone-coated asphalt tiles for luxury roofs.'),
  ('Ridge Caps & Apex', 'ridge-caps', 'Heavy-gauge apex caps to seal junctions against driving rainfall.'),
  ('Trimmers & Gutters', 'trimmers-and-parapets', 'Valley gutters, flashing trimmers, and parapet perimeter wall copings.'),
  ('Parapets & Flashing', 'parapets', 'Double drip edge architectural wall cappings for firewall perimeters.'),
  ('Corrugated Sheets', 'corrugated-sheets', 'Traditional heavy-gauge sinusoidal steel sheets for industrial structures.'),
  ('Roll Forming Services', 'roll-forming', 'Computerized on-site continuous roll forming rigs up to 30 metres unbroken.'),
  ('Bending & Fabrication', 'bending-services', 'CNC press brake metal folding, arch curving, and bespoke trims.'),
  ('Accessories & Fasteners', 'accessories', 'EPDM self-drilling hex fasteners, butyl waterproof tapes, and sealants.')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 2. Insert Products (7 Total)
INSERT INTO public.products (category_id, name, slug, description, base_price, min_order_quantity, is_active, product_type, unit, profile_kind)
VALUES
  (
    (SELECT id FROM public.categories WHERE slug = 'roofing-sheets'),
    'Premium Longspan Aluminium Roofing Sheet',
    'premium-longspan-aluminium-roofing-sheet',
    'Industrial & residential continuous longspan aluminium sheets available in custom lengths. Aluminium Alloy 3003, 900mm effective cover width, 25-year warranty, 85% solar reflectance.',
    3800,
    1,
    true,
    'dimensioned',
    'metre',
    'longspan'
  ),
  (
    (SELECT id FROM public.categories WHERE slug = 'metcopo-roofing'),
    'Metcopo Steptile Profile Sheet',
    'metcopo-steptile-profile-sheet',
    'Classic European clay tile aesthetics engineered in high-tensile aluzinc steel. Aluzinc Steel, 1000mm cover width, 28mm step height, 30-year warranty.',
    4200,
    1,
    true,
    'dimensioned',
    'metre',
    'metcoppo'
  ),
  (
    (SELECT id FROM public.categories WHERE slug = 'shingles'),
    'Stone-Coated Shake Shingle Tile',
    'stone-coated-shake-shingle-tile',
    'Multi-layered volcanic basalt stone-coated asphalt tiles for luxury roofs. Galvalume steel core with natural volcanic basalt stone granules, 1340mm × 420mm, 50-year warranty.',
    5400,
    1,
    true,
    'standard',
    'piece',
    'shingle'
  ),
  (
    (SELECT id FROM public.categories WHERE slug = 'ridge-caps'),
    'Heavy-Gauge Ridged Apex Cap (2m Length)',
    'heavy-gauge-ridged-apex-cap',
    'Heavy-gauge apex caps to seal junctions against driving rainfall. Heavy-gauge aluminium/aluzinc, 2000mm length, 450mm girth, folded weather return lips.',
    2800,
    1,
    true,
    'standard',
    'piece',
    'ridge'
  ),
  (
    (SELECT id FROM public.categories WHERE slug = 'roll-forming'),
    'On-Site Continuous Roll Forming Service',
    'on-site-continuous-roll-forming-service',
    'Computerized on-site continuous roll forming rigs up to 30 metres unbroken. Mobile computerized hydraulic rig deployed to construction sites, 4 certified engineers, up to 5,000m daily extrusion capacity (up to 30m seamless unbroken sheets).',
    25000,
    1,
    true,
    'service',
    'service',
    'roll-forming'
  ),
  (
    (SELECT id FROM public.categories WHERE slug = 'bending-services'),
    'Custom CNC Sheet Bending & Curving Service',
    'custom-cnc-sheet-bending-and-curving-service',
    'CNC press brake metal folding, arch curving, and bespoke trims. CNC press brake folding up to 1.2mm thickness, ±0.5° angular tolerance, arch curving & valley trims, 24–48hr turnaround.',
    850,
    1,
    true,
    'service',
    'metre',
    'bending'
  ),
  (
    (SELECT id FROM public.categories WHERE slug = 'accessories'),
    'Self-Drilling Hex Roofing Screws (Pack of 100)',
    'self-drilling-hex-roofing-screws-pack-100',
    'Case-hardened carbon steel (12 × 55mm), high-temp UV-stabilized EPDM washer, Ruspert anti-corrosion coating. EPDM self-drilling hex fasteners, butyl waterproof tapes, and sealants.',
    6500,
    1,
    true,
    'standard',
    'bundle',
    'fastener'
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

-- 3. Insert Product Variants
INSERT INTO public.product_variants (product_id, name, sku, price_override, stock_quantity, is_active)
VALUES
  -- 1. Premium Longspan Aluminium Roofing Sheet Variants
  ((SELECT id FROM public.products WHERE slug = 'premium-longspan-aluminium-roofing-sheet'), '0.45mm / Wine Red', 'LS-045-WR', 3800, 1000, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-longspan-aluminium-roofing-sheet'), '0.50mm / Wine Red', 'LS-050-WR', 4200, 1000, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-longspan-aluminium-roofing-sheet'), '0.55mm / Slate Grey', 'LS-055-SG', 4700, 1000, true),
  ((SELECT id FROM public.products WHERE slug = 'premium-longspan-aluminium-roofing-sheet'), '0.50mm / Forest Green', 'LS-050-FG', 4200, 1000, true),

  -- 2. Metcopo Steptile Profile Sheet Variants
  ((SELECT id FROM public.products WHERE slug = 'metcopo-steptile-profile-sheet'), '0.50mm / Traffic Blue', 'MC-050-TB', 4200, 1000, true),
  ((SELECT id FROM public.products WHERE slug = 'metcopo-steptile-profile-sheet'), '0.55mm / Charcoal Black', 'MC-055-CB', 4800, 1000, true),

  -- 3. Stone-Coated Shake Shingle Tile Variants
  ((SELECT id FROM public.products WHERE slug = 'stone-coated-shake-shingle-tile'), 'Basalt Charcoal Black', 'SH-ST-BLK', 5400, 1000, true),
  ((SELECT id FROM public.products WHERE slug = 'stone-coated-shake-shingle-tile'), 'Spanish Coffee Brown', 'SH-ST-BRN', 5400, 1000, true),

  -- 4. Heavy-Gauge Ridged Apex Cap Variant
  ((SELECT id FROM public.products WHERE slug = 'heavy-gauge-ridged-apex-cap'), 'Standard Apex Cap (2m Length)', 'RC-APEX-2M', 2800, 500, true),

  -- 5. On-Site Continuous Roll Forming Service Variant
  ((SELECT id FROM public.products WHERE slug = 'on-site-continuous-roll-forming-service'), 'On-Site Machine Deployment', 'SRV-ROLL-FORM', 25000, 100, true),

  -- 6. Custom CNC Sheet Bending & Curving Service Variant
  ((SELECT id FROM public.products WHERE slug = 'custom-cnc-sheet-bending-and-curving-service'), 'Custom CNC Bending & Curving', 'SRV-CNC-BEND', 850, 10000, true),

  -- 7. Self-Drilling Hex Roofing Screws Variant
  ((SELECT id FROM public.products WHERE slug = 'self-drilling-hex-roofing-screws-pack-100'), 'Self-Drilling Hex Screws (Pack of 100)', 'ACC-HEX-100', 6500, 500, true)
ON CONFLICT (sku) DO UPDATE SET
  product_id = EXCLUDED.product_id,
  name = EXCLUDED.name,
  price_override = EXCLUDED.price_override,
  stock_quantity = EXCLUDED.stock_quantity,
  is_active = EXCLUDED.is_active;

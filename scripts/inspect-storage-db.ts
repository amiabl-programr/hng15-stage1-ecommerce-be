import { Client } from 'pg';
import '../src/config/load-env-file.ts';

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('No SUPABASE_DB_URL or DATABASE_URL found.');
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const bucketsRes = await client.query('SELECT * FROM storage.buckets');
    console.log('=== STORAGE BUCKETS ===');
    console.log(bucketsRes.rows);

    const objectsRes = await client.query(`
      SELECT id, bucket_id, name, created_at, metadata
      FROM storage.objects
      ORDER BY bucket_id, name
    `);
    console.log('\n=== ALL STORAGE OBJECTS (' + objectsRes.rows.length + ') ===');
    console.log(JSON.stringify(objectsRes.rows, null, 2));

    const categoryImages = await client.query('SELECT * FROM category_images');
    console.log('\n=== CATEGORY IMAGES (' + categoryImages.rows.length + ') ===');
    console.log(JSON.stringify(categoryImages.rows, null, 2));

    const productImages = await client.query('SELECT * FROM product_images');
    console.log('\n=== PRODUCT IMAGES (' + productImages.rows.length + ') ===');
    console.log(JSON.stringify(productImages.rows, null, 2));

    const categoriesRes = await client.query('SELECT id, name, slug FROM categories ORDER BY name');
    console.log('\n=== CATEGORIES (' + categoriesRes.rows.length + ') ===');
    console.log(JSON.stringify(categoriesRes.rows, null, 2));

    const productsRes = await client.query('SELECT id, name, slug, category_id FROM products ORDER BY name');
    console.log('\n=== PRODUCTS (' + productsRes.rows.length + ') ===');
    console.log(JSON.stringify(productsRes.rows, null, 2));

  } finally {
    await client.end();
  }
}

main().catch(console.error);

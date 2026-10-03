import { Client } from 'pg';
import '../src/config/load-env-file.ts';

async function checkConstraints() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT conname, conrelid::regclass, pg_get_constraintdef(c.oid) 
      FROM pg_constraint c 
      JOIN pg_namespace n ON n.oid = c.connamespace 
      WHERE n.nspname = 'public' AND conrelid::regclass::text IN ('category_images', 'product_images');
    `);
    console.log(res.rows);
  } finally {
    await client.end();
  }
}

checkConstraints().catch(console.error);

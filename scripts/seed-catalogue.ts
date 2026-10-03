import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';

import '../src/config/load-env-file.ts';

/**
 * Seed script for 11 Categories, 17 Products, and 48 Variants per seed_data.md.
 */
async function main(): Promise<void> {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('No DB URL provided (SUPABASE_DB_URL or DATABASE_URL). Seed SQL is available in supabase/seed.sql');
    return;
  }

  const seedSqlPath = resolve('supabase/seed.sql');
  const sql = await readFile(seedSqlPath, 'utf8');

  const client = new Client({ connectionString });
  await client.connect();

  try {
    console.log('Applying comprehensive catalogue seeds (11 categories, 17 products, 48 variants) to PostgreSQL...');
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    console.log('Successfully applied seed_data.md catalogue seeds!');
  } catch (error) {
    await client.query('rollback');
    console.error('Failed to seed catalogue via PostgreSQL:', error);
    throw error;
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

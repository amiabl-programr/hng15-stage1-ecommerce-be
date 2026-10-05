import '../src/config/load-env-file.ts';
import { db, publicDb } from '../src/config/supabase.ts';
import type { Database } from '../src/config/database.types.ts';

async function main() {
  console.log('Testing PostgREST queries across all tables...');

  const tables = [
    'profiles',
    'sessions',
    'email_outbox',
    'orders',
    'products',
    'categories',
    'cart_items',
    'fabrication_requests',
  ] as const satisfies ReadonlyArray<keyof Database['public']['Tables']>;

  for (const table of tables) {
    const { data, error } = await db.from(table).select('*').limit(1);
    if (error) {
      console.error(`❌ Table ${table} FAILED:`, error);
    } else {
      console.log(`✅ Table ${table} OK (rows found: ${data?.length ?? 0})`);
    }
  }

  // Also test publicDb on products
  const { data: pubData, error: pubError } = await publicDb.from('products').select('id, name').limit(1);
  if (pubError) {
    console.error('❌ publicDb on products FAILED:', pubError);
  } else {
    console.log(`✅ publicDb on products OK (rows found: ${pubData?.length ?? 0})`);
  }
}

main().catch(console.error);

import { createClient } from '@supabase/supabase-js';

import type { Database } from './database.types.ts';
import { env } from './env.ts';

const config = env();

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

/**
 * Every write, every authenticated read, and every admin operation. Bypasses RLS, so
 * authorisation for anything routed through it is the API's job — notes.md §1 records
 * that the database is not providing it.
 */
export const db = createClient<Database>(
  config.supabaseUrl.toString(),
  config.supabaseSecretKey,
  clientOptions,
);

/**
 * Public catalogue reads only. Exists so that path stays RLS-enforced and cannot be
 * widened by accident: notes.md §4 makes this the reason the two clients are separate.
 */
export const publicDb = createClient<Database>(
  config.supabaseUrl.toString(),
  config.supabaseAnonKey,
  clientOptions,
);
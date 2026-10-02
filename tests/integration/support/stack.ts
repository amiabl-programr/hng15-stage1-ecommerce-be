import { Pool, type PoolClient } from 'pg';

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export const databaseUrl = process.env.TEST_SUPABASE_DB_URL ?? DEFAULT_DATABASE_URL;

export const pool = new Pool({ connectionString: databaseUrl, max: 10 });

/**
 * Set by tests/integration/global-setup.ts, which probes the database once in the
 * main process before workers fork.
 */
export const stackAvailable = process.env.TEST_STACK_AVAILABLE === 'true';

/**
 * Integration tests need real row locks, real partial unique indexes and real
 * transactions. A mocked Supabase client would let every correctness item in
 * notes.md §16 pass while the implementation is wrong, so there is no mocked
 * fallback here — an absent stack means the suite is skipped loudly, not weakened.
 */
export function describeWithStack(name: string, suite: () => void): void {
  if (stackAvailable) {
    describe(name, suite);
  } else {
    describe.skip(name, suite);
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
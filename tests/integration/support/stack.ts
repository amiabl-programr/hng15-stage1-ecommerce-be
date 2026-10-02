import '../../../src/config/load-env-file.ts';
import { afterAll } from '@jest/globals';
import { Pool, type PoolClient } from 'pg';

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export const databaseUrl = process.env.TEST_SUPABASE_DB_URL ?? DEFAULT_DATABASE_URL;

export const pool = new Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 20_000 });

/** How long the teardown waits for checked-out clients before destroying them. */
const POOL_DRAIN_GRACE_MS = 5_000;

/** Clients currently handed out by this Pool, tracked so the teardown can find strays. */
const checkedOut = new Set<PoolClient>();

pool.on('acquire', (client: PoolClient) => {
  checkedOut.add(client);
});

// pg emits (err, client) here, not (client).
pool.on('release', (_error: Error, client: PoolClient) => {
  checkedOut.delete(client);
});

/**
 * Jest gives every test file its own module registry, so each file that imports this
 * module gets its own Pool — one file's pool is never another's to reuse. That also
 * makes the teardown safe: closing it here cannot strand a sibling file, and this
 * afterAll is registered on the root block, so it runs once *after every* suite in the
 * file has finished rather than after whichever suite happened to be declared first.
 * Skipped suites (`describeWithStack` on an absent stack) still register it, so the hook
 * stays symmetric with the module-level Pool.
 *
 * Without this the Pool's idle-but-open sockets keep the event loop alive and Jest
 * prints "Jest did not exit one second after the test run has completed."
 *
 * This module is imported only by test files; global-setup.mjs opens and closes its
 * own one-shot Client and never touches this Pool.
 */
afterAll(async () => {
  const drained = pool.end().catch(() => undefined);

  // end() resolves only once every checked-out client has come back. A test that timed
  // out mid-statement never returns its client, so an unbounded wait here would turn one
  // failure into a hung suite and then a second, misleading one on this hook. Give the
  // drain a grace period and then destroy whatever is still out.
  let grace: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<void>((resolve) => {
    grace = setTimeout(resolve, POOL_DRAIN_GRACE_MS);
  });

  await Promise.race([drained, expired]);
  clearTimeout(grace);

  // Releasing with an error removes the client from the pool instead of returning it to
  // the idle list, so pg closes the socket and the drain finishes.
  for (const client of checkedOut) {
    client.release(
      new Error('integration pool shutdown: client still checked out'),
    );
  }

  await drained;
});

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

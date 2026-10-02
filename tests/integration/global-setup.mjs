import { Client } from 'pg';

// Plain .mjs on purpose: Jest loads globalSetup outside the transform pipeline, so it
// cannot be TypeScript. It also has to default-export a function — a side-effect-only
// module is rejected before it ever runs.
export default async function globalSetup() {
  const connectionString = process.env.TEST_SUPABASE_DB_URL;

  if (connectionString === undefined || connectionString.length === 0) {
    process.env.TEST_STACK_AVAILABLE = 'false';
    console.warn(SKIP_MESSAGE('TEST_SUPABASE_DB_URL is not set'));
    return;
  }

  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000 });

  try {
    await client.connect();
    await client.query('select 1');
    process.env.TEST_STACK_AVAILABLE = 'true';
  } catch (error) {
    process.env.TEST_STACK_AVAILABLE = 'false';
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(SKIP_MESSAGE(`cannot connect to ${redactUrl(connectionString)} — ${reason}`));
  } finally {
    await client.end().catch(() => undefined);
  }
}

function SKIP_MESSAGE(reason) {
  return [
    '',
    '  No test database reachable. Integration tests will be SKIPPED.',
    `  Reason: ${reason}`,
    '  Point TEST_SUPABASE_DB_URL at the linked Supabase project\'s direct',
    '  connection (port 5432, not the pooler) and re-run pnpm test:integration.',
    '  These tests are not optional — they are the only evidence for the',
    '  correctness, image and security items in notes.md §16. Skipping is a',
    '  deliberate deferral, not a pass.',
    '',
  ].join('\n');
}

function redactUrl(value) {
  return value.replace(/\/\/[^:/@]*:[^@]*@/, '//***:***@');
}
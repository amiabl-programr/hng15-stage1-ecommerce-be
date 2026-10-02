import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Client } from 'pg';

/**
 * Step 1 of the schema change loop in plan.md: apply SQL to the linked hosted
 * database so it can be verified there and then captured with `supabase db pull`.
 *
 * The SQL file is deliberately transient — keep it outside the repository. The
 * committed artefact is the migration the CLI generates afterwards, not this file.
 *
 * `supabase db query` is the intended path; this exists so the loop does not depend
 * on a CLI version that may not have the subcommand.
 */

const USAGE = 'usage: pnpm db:apply --file <path-to.sql>';

function parseArgs(argv: readonly string[]): { file: string } {
  const fileIndex = argv.indexOf('--file');
  const file = fileIndex === -1 ? undefined : argv[fileIndex + 1];

  if (file === undefined || file.startsWith('--')) {
    throw new Error(USAGE);
  }

  return { file };
}

async function main(): Promise<void> {
  const { file } = parseArgs(process.argv.slice(2));

  const connectionString = process.env.SUPABASE_DB_URL;
  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error(
      'SUPABASE_DB_URL is not set. Use the direct connection string on port 5432, not the pooler.',
    );
  }

  const sql = await readFile(resolve(file), 'utf8');
  const client = new Client({ connectionString });

  await client.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }

  console.log(`applied ${file}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
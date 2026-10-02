import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { serialise } from '../src/contracts/document.ts';

/**
 * CLI around src/contracts/document.ts.
 *
 * Committed output, not a build artefact: the frontend is a separate repository with no
 * access to this one, and this file is the whole handoff. `--check` regenerates and
 * compares, which is what turns notes.md §16's "generated from the zod schemas and
 * committed" into something review can enforce instead of merely hope for.
 */

const OUTPUT_PATH = resolve('openapi.json');

async function main(): Promise<void> {
  const serialised = serialise();

  if (process.argv.includes('--check')) {
    const committed = await readFile(OUTPUT_PATH, 'utf8').catch(() => '');

    if (committed === serialised) {
      console.log('openapi.json is up to date');
      return;
    }

    console.error(
      [
        'openapi.json is stale — the contracts and the committed document disagree.',
        'Run `pnpm openapi:generate` and commit the result.',
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  await writeFile(OUTPUT_PATH, serialised, 'utf8');
  console.log(`wrote ${OUTPUT_PATH}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
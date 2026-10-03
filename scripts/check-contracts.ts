import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { serialise } from '../src/contracts/document.ts';

/**
 * Phase 14 contract integrity checker.
 * Compares committed openapi.json against generated spec from Zod contracts.
 */
async function main(): Promise<void> {
  const outputPath = resolve('openapi.json');
  const generated = serialise();
  const committed = await readFile(outputPath, 'utf8').catch(() => '');

  if (committed !== generated) {
    console.error('Contract check failed: openapi.json does not match Zod contracts.');
    console.error('Run `pnpm openapi:generate` to regenerate.');
    process.exit(1);
  }

  console.log('Contract check passed: openapi.json matches Zod contracts.');
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

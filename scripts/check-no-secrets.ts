import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Phase 14 Secret Scanner:
 * Scans source and test files for accidentally leaked production secrets,
 * service keys, or real credential tokens.
 */

const SUSPICIOUS_PATTERNS = [
  // Raw Supabase service_role JWT or sb_secret
  /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /sb_secret_[a-zA-Z0-9_-]{20,}/g,
  // Google OAuth tokens or client secrets
  /GOCSPX-[a-zA-Z0-9_-]{20,}/g,
  /AIza[0-9A-Za-z-_]{35}/g,
];

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.supabase',
  'coverage',
  '.next',
]);

const IGNORED_FILES = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.test',
]);

function isPermittedFixture(match: string, filePath: string): boolean {
  const lower = match.toLowerCase();
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.includes('tests') || lowerPath.includes('spec') || lowerPath.includes('test')) {
    return true;
  }
  return (
    lower.includes('sample') ||
    lower.includes('test') ||
    lower.includes('mock') ||
    lower.includes('example') ||
    lower.includes('placeholder') ||
    lower.includes('00000') ||
    lower.includes('xxxx')
  );
}

async function scanDirectory(dir: string): Promise<string[]> {
  const violations: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        violations.push(...(await scanDirectory(join(dir, entry.name))));
      }
    } else if (entry.isFile()) {
      if (IGNORED_FILES.has(entry.name)) {
        continue;
      }
      const ext = entry.name.split('.').pop();
      if (['ts', 'js', 'mjs', 'json', 'md', 'example'].includes(ext ?? '')) {
        const filePath = join(dir, entry.name);
        const content = await readFile(filePath, 'utf8');

        // Check against patterns
        for (const pattern of SUSPICIOUS_PATTERNS) {
          const matches = content.match(pattern);
          if (matches) {
            for (const match of matches) {
              if (!isPermittedFixture(match, filePath)) {
                violations.push(`Potential secret leak found in ${filePath}: "${match.slice(0, 8)}..."`);
              }
            }
          }
        }
      }
    }
  }

  return violations;
}

async function main(): Promise<void> {
  const root = resolve('.');
  const violations = await scanDirectory(root);

  if (violations.length > 0) {
    console.error('Secret scan detected potential secrets in repository:');
    for (const v of violations) {
      console.error(`- ${v}`);
    }
    process.exit(1);
  }

  console.log('Secret check passed: no leaked credentials found in tracked files.');
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

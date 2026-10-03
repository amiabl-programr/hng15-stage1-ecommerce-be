import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

describe('architectural boundaries', () => {
  const rootSrc = resolve('src');

  async function getFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await getFiles(fullPath)));
      } else if (entry.isFile() && fullPath.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  it('ensures src/models/** never imports express, contracts, services, or controllers', async () => {
    const modelsDir = join(rootSrc, 'models');
    const modelFiles = await getFiles(modelsDir);

    expect(modelFiles.length).toBeGreaterThan(0);

    for (const file of modelFiles) {
      const content = await readFile(file, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('import ') || line.trim().startsWith('export * from')) {
          expect(line).not.toMatch(/from\s+['"].*express.*['"]/);
          expect(line).not.toMatch(/from\s+['"].*contracts.*['"]/);
          expect(line).not.toMatch(/from\s+['"].*services.*['"]/);
          expect(line).not.toMatch(/from\s+['"].*controllers.*['"]/);
        }
      }
    }
  });

  it('ensures src/services/** never imports express, Request/Response, routes, or controllers', async () => {
    const servicesDir = join(rootSrc, 'services');
    const serviceFiles = await getFiles(servicesDir);

    expect(serviceFiles.length).toBeGreaterThan(0);

    for (const file of serviceFiles) {
      const content = await readFile(file, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('import ')) {
          expect(line).not.toMatch(/from\s+['"]express(\/.*)?['"]/);
          expect(line).not.toMatch(/from\s+['"].*routes.*['"]/);
          expect(line).not.toMatch(/from\s+['"].*controllers.*['"]/);
        }
      }
    }
  });

  it('ensures src/controllers/** never imports @supabase/supabase-js or supabase config directly', async () => {
    const controllersDir = join(rootSrc, 'controllers');
    const controllerFiles = await getFiles(controllersDir);

    expect(controllerFiles.length).toBeGreaterThan(0);

    for (const file of controllerFiles) {
      const content = await readFile(file, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('import ')) {
          expect(line).not.toMatch(/from\s+['"]@supabase\/supabase-js['"]/);
          expect(line).not.toMatch(/from\s+['"].*config\/supabase(\.ts)?['"]/);
        }
      }
    }
  });

  it('ensures src/routes/** never imports @supabase/supabase-js or supabase config directly', async () => {
    const routesDir = join(rootSrc, 'routes');
    const routeFiles = await getFiles(routesDir);

    expect(routeFiles.length).toBeGreaterThan(0);

    for (const file of routeFiles) {
      const content = await readFile(file, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('import ')) {
          expect(line).not.toMatch(/from\s+['"]@supabase\/supabase-js['"]/);
          expect(line).not.toMatch(/from\s+['"].*config\/supabase(\.ts)?['"]/);
        }
      }
    }
  });

  it('validates that package.json has no frontend rendering dependencies (next, react, clsx, tailwind-merge)', async () => {
    const pkgContent = await readFile(resolve('package.json'), 'utf8');
    const pkg = JSON.parse(pkgContent);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    expect(deps).not.toHaveProperty('next');
    expect(deps).not.toHaveProperty('react');
    expect(deps).not.toHaveProperty('clsx');
    expect(deps).not.toHaveProperty('tailwind-merge');
  });
});

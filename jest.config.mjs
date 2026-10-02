/** @type {import('ts-jest').JestConfigWithTsJest} */
const tsTransform = {
  '^.+\\.ts$': [
    'ts-jest',
    {
      tsconfig: {
        module: 'esnext',
        moduleResolution: 'bundler',
        allowImportingTsExtensions: true,
        // The source tree imports with explicit .ts specifiers and relies on
        // rewriteRelativeImportExtensions to turn them into .js at build time.
        // ts-jest emits in-memory, so leaving it on rewrites the specifier to a .js
        // path that does not exist on disk and jest cannot resolve it.
        rewriteRelativeImportExtensions: false,
        esModuleInterop: true,
        verbatimModuleSyntax: true,
        isolatedModules: true,
      },
      useESM: true,
    },
  ],
};

const shared = {
  transform: tsTransform,
  extensionsToTreatAsEsm: ['.ts'],
  clearMocks: true,
  restoreMocks: true,
  transformIgnorePatterns: ['node_modules/(?!(@roofing)/)'],
};

export default {
  /**
   * This belongs at the root, NOT inside a `projects` entry. jest-circus resolves the
   * test timeout from `globalConfig.testTimeout` and from nowhere else:
   *
   *   jest-circus/build/jestAdapterInit.js
   *     if (globalConfig.testTimeout) { getState().testTimeout = globalConfig.testTimeout }
   *
   * Its state object is otherwise seeded with the hardcoded 5000ms default. A
   * `testTimeout` on a project is parsed onto `projectConfig` — which is why
   * `jest --showConfig` happily reports it under `configs[].testTimeout` — and then
   * ignored at run time, so every test still fired at 5000ms. Against the hosted
   * pooler a cold connection costs ~3.2s and every round trip ~320ms, which made
   * tests/integration/smoke.spec.ts fail intermittently with
   * "Exceeded timeout of 5000 ms".
   *
   * jest-circus has no per-project timeout, so this is the one budget both projects
   * get. It only widens the ceiling: the unit suite's tests finish in microseconds, so
   * the larger value is invisible unless one of them hangs, in which case it takes
   * longer to report.
   */
  testTimeout: 30000,
  projects: [
    {
      ...shared,
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.spec.ts', '<rootDir>/src/**/*.spec.ts'],
    },
    {
      ...shared,
      displayName: 'integration',
      testEnvironment: 'node',
      globalSetup: '<rootDir>/tests/integration/global-setup.mjs',
      testMatch: ['<rootDir>/tests/integration/**/*.spec.ts'],
    },
  ],
};
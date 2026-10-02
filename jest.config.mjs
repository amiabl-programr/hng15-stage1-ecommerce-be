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
      testTimeout: 30000,
    },
  ],
};
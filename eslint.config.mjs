import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

/**
 * Layer boundaries from notes.md §3:
 * - src/models/** may not import express, contracts, or services.
 * - src/services/** may not import express, Request, or Response.
 * - src/routes/** may not import @supabase/supabase-js or ../config/supabase.
 */

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', '.supabase/**', 'coverage/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/models/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'express',
                'express/*',
                '**/contracts/**',
                '../contracts/**',
                '**/services/**',
                '../services/**',
                '**/controllers/**',
                '../controllers/**',
              ],
              message: 'src/models/** may not import express, contracts, services, or controllers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/services/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'express',
                'express/*',
                '**/routes/**',
                '../routes/**',
                '**/controllers/**',
                '../controllers/**',
              ],
              message: 'src/services/** may not import express, Request, Response, routes, or controllers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/controllers/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@supabase/supabase-js',
                '**/config/supabase*',
                '../config/supabase*',
              ],
              message:
                'src/controllers/** may not import @supabase/supabase-js or ../config/supabase.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/routes/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@supabase/supabase-js',
                '**/config/supabase*',
                '../config/supabase*',
              ],
              message:
                'src/routes/** may not import @supabase/supabase-js or ../config/supabase.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
);
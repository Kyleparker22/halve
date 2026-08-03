import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      '**/coverage/**',
      'supabase/functions/_shared/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Node-side config and tooling, not app code.
    files: ['**/*.mjs', '**/*.cjs', '**/metro.config.js', 'scripts/**/*'],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // CLAUDE.md rule 1: money is integer cents. Floats are how you lose a dollar.
    files: ['packages/games/**/*.ts', 'packages/ledger/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: 'Money is integer cents. No float math in the money packages.' },
        { name: 'Date', message: '@halve/games and @halve/ledger are pure. No clock.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Pure package: no randomness.' },
        { object: 'Number', property: 'parseFloat', message: 'Money is integer cents.' },
      ],
    },
  },
);

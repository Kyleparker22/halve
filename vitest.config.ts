import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'games',
          root: './packages/games',
          environment: 'node',
          include: ['**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'ledger',
          root: './packages/ledger',
          environment: 'node',
          include: ['**/*.test.ts'],
        },
      },
      {
        // The offline scorecard. react-native-mmkv is native, so the store is
        // pointed at an in-memory stand-in with the same surface.
        resolve: {
          alias: {
            'react-native-mmkv': new URL('./apps/mobile/test/mmkv-mock.ts', import.meta.url)
              .pathname,
          },
        },
        test: {
          name: 'offline',
          root: './apps/mobile',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'db',
          root: './supabase/tests',
          environment: 'node',
          include: ['**/*.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
          // PGlite instances are heavy; one file at a time.
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/games/src/**/*.ts', 'packages/ledger/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/fixtures/**', '**/index.ts'],
      thresholds: {
        // Hard gate — the money code. See 02 Technical Spec §10.
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 80,
      },
    },
  },
});

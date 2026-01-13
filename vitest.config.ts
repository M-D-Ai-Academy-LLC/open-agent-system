import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Global test settings
    globals: true,
    environment: 'node',

    // Include patterns
    include: ['packages/**/*.test.ts', 'packages/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['packages/**/src/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/index.ts',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },

    // Test timeout
    testTimeout: 10000,

    // Pool options for parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },

    // Reporter configuration
    reporters: ['default'],

    // Setup files (if needed)
    // setupFiles: ['./test/setup.ts'],

    // Type checking
    typecheck: {
      enabled: false, // We run typecheck separately via turbo
    },
  },
});

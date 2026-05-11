import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    include:     ['tests/unit/**/*.test.ts'],
    exclude:     ['tests/build/**', 'node_modules/**'],
    environment: 'jsdom',
    setupFiles:  ['tests/setup.ts'],
    globals:     true,
    isolate:     true,
    reporters:   ['verbose'],
    testTimeout:  60_000,
    hookTimeout:  30_000,
  },
});

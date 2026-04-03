import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: ['src/**/*.test.ts'],
    globalSetup: './src/test/global-setup.ts',
    setupFiles: ['./src/test/setup.ts'],
  },
});

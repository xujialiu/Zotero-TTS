import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The plugin's strings as a user reads them: t() renders the en-US
    // Fluent file in every test (test/setup.ts, issue #30)
    setupFiles: ['test/setup.ts'],
  },
});

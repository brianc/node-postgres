import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/cloudflare/**', 'test/native/**', '**/node_modules/**', '**/dist/**'],
    testTimeout: 30000,
    // Integration tests share a single Postgres instance and many of them
    // create temp tables, alter session settings, or rely on serial
    // command-complete ordering. Running test files in parallel causes
    // intermittent cross-test interference (notably notice, simple-query,
    // big-simple-query, prepared-statement). Force a single worker until
    // each suite manages its own isolation.
    fileParallelism: false,
  },
})

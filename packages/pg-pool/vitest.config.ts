import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 15000,
    // Pool tests start dozens of clients against a single Postgres
    // and rely on idle/lifetime timer ordering. Parallel files cause
    // intermittent races; serialize them.
    fileParallelism: false,
  },
})

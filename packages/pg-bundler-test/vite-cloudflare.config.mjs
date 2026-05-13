import { defineConfig } from 'vite'
import commonjs from '@rollup/plugin-commonjs'

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: './src/index.mjs',
      fileName: 'vite-cloudflare',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['cloudflare:sockets'],
    },
  },
  resolve: {
    conditions: ['import', 'workerd'],
  },
  plugins: [commonjs()],
})

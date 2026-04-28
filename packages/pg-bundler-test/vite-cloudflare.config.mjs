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
      // Workers' nodejs_compat exposes node: builtins at runtime; leave
      // them external in the bundle alongside cloudflare:sockets.
      external: ['cloudflare:sockets', /^node:/],
    },
  },
  resolve: {
    conditions: ['import', 'workerd'],
  },
  plugins: [commonjs()],
})

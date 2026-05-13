import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: './src/index.mjs',
      fileName: 'vite-empty',
      formats: ['es'],
    },
  },
})

import { defineConfig } from 'rollup'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'

export default defineConfig({
  input: './src/index.mjs',
  output: {
    file: 'dist/rollup-empty.js',
    format: 'es',
  },
  plugins: [nodeResolve(), commonjs()],
})

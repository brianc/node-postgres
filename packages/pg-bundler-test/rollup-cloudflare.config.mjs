import { defineConfig } from 'rollup'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'

export default defineConfig({
  input: './src/index.mjs',
  output: {
    file: 'dist/rollup-cloudflare.js',
    format: 'es',
  },
  plugins: [nodeResolve({ exportConditions: ['import', 'cloudflare'], preferBuiltins: true }), commonjs()],
  external: ['cloudflare:sockets'],
})

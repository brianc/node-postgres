import { defineConfig } from 'rollup'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'

export default defineConfig({
  input: './src/index.mjs',
  output: {
    file: 'dist/rollup-cloudflare.js',
    format: 'es',
  },
  plugins: [nodeResolve({ exportConditions: ['import', 'workerd'], preferBuiltins: true }), commonjs()],
  // Workers' nodejs_compat exposes node: builtins at runtime; leave them
  // as bare imports in the bundle.
  external: ['cloudflare:sockets', /^node:/],
})

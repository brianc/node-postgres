import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['./src/index.mjs'],
  bundle: true,
  format: 'esm',
  outfile: './dist/esbuild-cloudflare.js',
  conditions: ['import', 'workerd'],
  // Workers' nodejs_compat exposes node: builtins at runtime; leave them
  // external alongside cloudflare:sockets.
  external: ['cloudflare:sockets', 'node:*'],
})

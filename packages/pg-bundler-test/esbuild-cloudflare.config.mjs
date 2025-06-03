import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['./src/index.mjs'],
  bundle: true,
  outfile: './dist/esbuild-cloudflare.js',
  conditions: ['import', 'cloudflare'],
})

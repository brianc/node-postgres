// Entry consumed by every bundler scenario. We deliberately reference
// the named export so tree-shaking can't strip the module — bundlers
// still have to fully resolve `pg-cloudflare` (including the workerd
// vs default conditional exports) and emit a non-empty chunk.
import { CloudflareSocket } from 'pg-cloudflare'

if (!CloudflareSocket) {
  throw new Error('pg-cloudflare did not expose CloudflareSocket')
}

export { CloudflareSocket }

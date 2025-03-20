// ESM wrapper for pg-cloudflare
import module from '../dist/empty.js'

// Re-export any named exports and the default
export const CloudflareSocket = module.CloudflareSocket
export default module

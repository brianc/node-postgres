// ESM wrapper for pg-cloudflare in Cloudflare Workers
import module from '../dist/index.js';

// Re-export CloudflareSocket and the default
export const CloudflareSocket = module.CloudflareSocket;
export default module; 
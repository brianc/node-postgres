// Crypto utilities for older Node.js without WebCrypto. Kept for ABI parity with
// utils-webcrypto.ts; the runtime selects between them in utils.ts based on the
// detected Node version.

import { Buffer } from 'node:buffer'
import * as nodeCrypto from 'node:crypto'

export function md5(input: string | Buffer): string {
  return nodeCrypto
    .createHash('md5')
    .update(input as string, 'utf-8')
    .digest('hex')
}

// See AuthenticationMD5Password at https://www.postgresql.org/docs/current/static/protocol-flow.html
export function postgresMd5PasswordHash(user: string, password: string, salt: Buffer): string {
  const inner = md5(password + user)
  const outer = md5(Buffer.concat([Buffer.from(inner), salt]))
  return 'md5' + outer
}

export function sha256(text: Buffer | string): Buffer {
  return nodeCrypto.createHash('sha256').update(text).digest()
}

export function hashByName(hashName: string, text: Buffer | string): Buffer {
  const normalized = hashName.replace(/(\D)-/, '$1') // e.g. SHA-256 -> SHA256
  return nodeCrypto.createHash(normalized).update(text).digest()
}

export function hmacSha256(key: Buffer | string, msg: Buffer | string): Buffer {
  return nodeCrypto.createHmac('sha256', key).update(msg).digest()
}

export async function deriveKey(password: string, salt: Buffer, iterations: number): Promise<Buffer> {
  return nodeCrypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256')
}

export const randomBytes: typeof nodeCrypto.randomBytes = nodeCrypto.randomBytes

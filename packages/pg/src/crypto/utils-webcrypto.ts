// Modern WebCrypto-backed crypto helpers. These return promises and Buffer-compatible
// values where possible so callers can interchange them with utils-legacy.

import { Buffer } from 'node:buffer'
import * as nodeCrypto from 'node:crypto'

const webCrypto: Crypto =
  (nodeCrypto as unknown as { webcrypto?: Crypto }).webcrypto ?? (globalThis as unknown as { crypto: Crypto }).crypto

const subtleCrypto: SubtleCrypto = webCrypto.subtle
const textEncoder = new TextEncoder()

export function randomBytes(length: number): Buffer {
  return webCrypto.getRandomValues(Buffer.alloc(length))
}

export async function md5(input: string | Buffer): Promise<string> {
  try {
    return nodeCrypto
      .createHash('md5')
      .update(input as string, 'utf-8')
      .digest('hex')
  } catch {
    // `createHash()` failed so we are probably not in Node.js, use the WebCrypto API.
    // Note: MD5 isn't available in Node's WebCrypto, so we only hit this path on workerd.
    const data = typeof input === 'string' ? textEncoder.encode(input) : input
    const hash = await subtleCrypto.digest('MD5', data as unknown as ArrayBuffer)
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
}

// See AuthenticationMD5Password at https://www.postgresql.org/docs/current/static/protocol-flow.html
export async function postgresMd5PasswordHash(user: string, password: string, salt: Buffer): Promise<string> {
  const inner = await md5(password + user)
  const outer = await md5(Buffer.concat([Buffer.from(inner), salt]))
  return 'md5' + outer
}

export async function sha256(data: Buffer | ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
  return subtleCrypto.digest('SHA-256', data as unknown as ArrayBuffer)
}

export async function hashByName(hashName: string, data: Buffer | ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
  return subtleCrypto.digest(hashName, data as unknown as ArrayBuffer)
}

export async function hmacSha256(keyBuffer: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const key = await subtleCrypto.importKey(
    'raw',
    keyBuffer as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return subtleCrypto.sign('HMAC', key, textEncoder.encode(msg))
}

export async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await subtleCrypto.importKey(
    'raw',
    textEncoder.encode(password) as unknown as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const params: Pbkdf2Params = { name: 'PBKDF2', hash: 'SHA-256', salt: salt as unknown as BufferSource, iterations }
  return subtleCrypto.deriveBits(params, key, 32 * 8)
}

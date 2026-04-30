// Selects between the legacy (Node < 15) and the modern WebCrypto-based crypto
// helpers. Since we target Node >=22 the legacy module is here only for
// completeness; the WebCrypto module is what we re-export by default.

import * as legacy from './utils-legacy.ts'
import * as webcrypto from './utils-webcrypto.ts'

const nodeMajor = parseInt(
  (process.versions && process.versions.node && process.versions.node.split('.')[0]) || '0',
  10
)
const useLegacyCrypto = nodeMajor < 15

const impl = useLegacyCrypto ? (legacy as unknown as typeof webcrypto) : webcrypto

export const postgresMd5PasswordHash: typeof webcrypto.postgresMd5PasswordHash = impl.postgresMd5PasswordHash
export const randomBytes: typeof webcrypto.randomBytes = impl.randomBytes
export const deriveKey: typeof webcrypto.deriveKey = impl.deriveKey
export const sha256: typeof webcrypto.sha256 = impl.sha256
export const hashByName: typeof webcrypto.hashByName = impl.hashByName
export const hmacSha256: typeof webcrypto.hmacSha256 = impl.hmacSha256
export const md5: typeof webcrypto.md5 = impl.md5

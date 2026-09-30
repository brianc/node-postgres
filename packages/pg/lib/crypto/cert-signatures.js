function x509Error(msg, cert) {
  return new Error('SASL channel binding: ' + msg + ' when parsing public certificate ' + cert.toString('base64'))
}

function readASN1Length(data, index) {
  let length = data[index++]
  if (length === undefined) throw x509Error('end of data reading first length byte', data)

  if (length < 0x80) return { length, index }

  const lengthBytes = length & 0x7f
  if (lengthBytes > 4) throw x509Error('bad length', data)

  length = 0
  for (let i = 0; i < lengthBytes; i++) {
    const byte = data[index++]
    if (byte === undefined) throw x509Error('end of data reading length byte', data)
    length = (length << 8) | byte
  }

  return { length, index }
}

function readASN1OID(data, index) {
  const type = data[index++]
  if (type === undefined) throw x509Error('end of data reading OID type', data)
  if (type !== 0x6) throw x509Error('non-OID data', data) // 6 = OID

  const { length: OIDLength, index: indexAfterOIDLength } = readASN1Length(data, index)
  index = indexAfterOIDLength
  const lastIndex = index + OIDLength

  const byte1 = data[index++]
  if (byte1 === undefined) throw x509Error('end of data reading first OID byte', data)

  let oid = ((byte1 / 40) >> 0) + '.' + (byte1 % 40)

  while (index < lastIndex) {
    // loop over numbers in OID
    let value = 0
    while (index < lastIndex) {
      // loop over bytes in number
      const nextByte = data[index++]
      if (nextByte === undefined) throw x509Error('end of data reading OID byte', data)
      value = (value << 7) | (nextByte & 0x7f)
      if (nextByte < 0x80) break
    }
    oid += '.' + value
  }

  return { oid, index }
}

function expectASN1Seq(data, index) {
  const type = data[index++]
  if (type === undefined) throw x509Error('unexpected end of data reading sequence', data)
  else if (type !== 0x30) throw x509Error('non-sequence data', data) // 0x30 = Sequence
  return readASN1Length(data, index)
}

function signatureAlgorithmHashFromCertificate(data, index) {
  // read this thread: https://www.postgresql.org/message-id/17760-b6c61e752ec07060%40postgresql.org
  if (index === undefined) index = 0
  index = expectASN1Seq(data, index).index
  const { length: certInfoLength, index: indexAfterCertInfoLength } = expectASN1Seq(data, index)
  index = indexAfterCertInfoLength + certInfoLength // skip over certificate info
  index = expectASN1Seq(data, index).index // skip over signature length field
  const { oid, index: indexAfterOID } = readASN1OID(data, index)
  switch (oid) {
    // DSA, RSA and ECDSA
    case '1.2.840.113549.1.1.4': // RSA
    case '1.3.14.3.2.3': // RSA
      return 'MD5'
    case '1.2.840.10040.4.3': // DSA
    case '1.3.14.3.2.27': // DSA
    case '1.2.840.113549.1.1.5': // RSA
    case '1.3.14.3.2.29': // RSA
    case '1.2.840.10045.4.1': // ECDSA
      return 'SHA-1'
    case '2.16.840.1.101.3.4.3.1': // DSA
    case '1.2.840.113549.1.1.14': // RSA
    case '1.2.840.10045.4.3.1': // ECDSA
      return 'SHA-224'
    case '2.16.840.1.101.3.4.3.2': // DSA
    case '1.2.840.113549.1.1.11': // RSA
    case '1.2.840.10045.4.3.2': // ECDSA
      return 'SHA-256'
    case '2.16.840.1.101.3.4.3.3': // DSA
    case '1.2.840.113549.1.1.12': // RSA
    case '1.2.840.10045.4.3.3': // ECDSA
      return 'SHA-384'
    case '2.16.840.1.101.3.4.3.4': // DSA
    case '1.2.840.113549.1.1.13': // RSA
    case '1.2.840.10045.4.3.4': // ECDSA
      return 'SHA-512'
    case '1.2.840.113549.1.1.15': // RSA
      return 'SHA512-224'
    case '1.2.840.113549.1.1.16': // RSA
      return 'SHA512-256'
    case '2.16.840.1.101.3.4.3.5': // DSA
    case '2.16.840.1.101.3.4.3.13': // RSA
    case '2.16.840.1.101.3.4.3.9': // ECDSA
      return 'SHA3-224'
    case '2.16.840.1.101.3.4.3.6': // DSA
    case '2.16.840.1.101.3.4.3.14': // RSA
    case '2.16.840.1.101.3.4.3.10': // ECDSA
      return 'SHA3-256'
    case '2.16.840.1.101.3.4.3.7': // DSA
    case '2.16.840.1.101.3.4.3.15': // RSA
    case '2.16.840.1.101.3.4.3.11': // ECDSA
      return 'SHA3-384'
    case '2.16.840.1.101.3.4.3.8': // DSA
    case '2.16.840.1.101.3.4.3.16': // RSA
    case '2.16.840.1.101.3.4.3.12': // ECDSA
      return 'SHA3-512'

    // regional standards
    case '1.2.156.10197.1.501': // SM2
    case '1.2.156.10197.1.504': // RSA
      return 'SM3'
    case '1.2.643.7.1.1.3.2':
      return 'md_gost12_256'
    case '1.2.643.7.1.1.3.3':
      return 'md_gost12_512'

    // RSASSA-PSS: hash is indicated separately
    case '1.2.840.113549.1.1.10': {
      index = indexAfterOID
      index = expectASN1Seq(data, index).index
      const tag = data[index++]
      if (tag === undefined) throw x509Error('end of data reading RSASSA-PSS parameters', data)
      if (tag !== 0xa0 /* a0 = constructed tag [0] */) {
        // no hash indicated: SHA-1 is default per RFC 4055
        return 'SHA-1'
      }
      index = readASN1Length(data, index).index // skip over tag length field
      index = expectASN1Seq(data, index).index // skip over sequence length field
      const { oid: hashOID } = readASN1OID(data, index)
      switch (hashOID) {
        // standalone hash OIDs
        case '1.2.840.113549.2.5':
          return 'MD5'
        case '1.3.14.3.2.26':
          return 'SHA-1'
        case '2.16.840.1.101.3.4.2.1':
          return 'SHA-256'
        case '2.16.840.1.101.3.4.2.2':
          return 'SHA-384'
        case '2.16.840.1.101.3.4.2.3':
          return 'SHA-512'
        case '2.16.840.1.101.3.4.2.4':
          return 'SHA-224'
        case '2.16.840.1.101.3.4.2.5':
          return 'SHA512-224'
        case '2.16.840.1.101.3.4.2.6':
          return 'SHA512-256'
        case '2.16.840.1.101.3.4.2.7':
          return 'SHA3-224'
        case '2.16.840.1.101.3.4.2.8':
          return 'SHA3-256'
        case '2.16.840.1.101.3.4.2.9':
          return 'SHA3-384'
        case '2.16.840.1.101.3.4.2.10':
          return 'SHA3-512'
        case '1.2.156.10197.1.401':
          return 'SM3'
        case '1.2.643.7.1.1.2.2':
          return 'md_gost12_256'
        case '1.2.643.7.1.1.2.3':
          return 'md_gost12_512'
        case '1.2.840.113549.2.2':
        case '1.2.840.113549.2.4':
        case '1.3.36.3.2.1':
        case '1.2.643.2.2.9':
          throw x509Error(
            'channel binding is not supported for RSASSA-PSS certificates signed with obsolete algorithms MD2, MD4, RIPEMD160 or md_gost94'
          )
      }
      throw x509Error('unknown RSASSA-PSS hash OID ' + hashOID, data)
    }

    // obsolete and unsupported as insecure: MD5 and SHA-1 are upgraded to SHA-256, but these are not
    case '1.2.840.113549.1.1.2':
    case '1.2.840.113549.1.1.3':
    case '2.5.8.3.100':
    case '1.3.14.3.2.15':
    case '1.3.36.3.3.1.2':
    case '1.2.643.2.2.3':
    case '1.2.643.2.2.4':
    case '1.2.643.2.9.1.3.3':
    case '1.2.643.2.9.1.3.4':
      throw x509Error(
        'channel binding is not supported for certificates signed with obsolete algorithms MD2, MD4, MDC2, SHA-0, RIPEMD160 or md_gost94'
      )

    // EdDSA and post-quantum crypto: no separate hash function, no Postgres support
    case '1.3.101.112':
    case '1.3.101.113':
    case '2.16.840.1.101.3.4.3.17':
    case '2.16.840.1.101.3.4.3.18':
    case '2.16.840.1.101.3.4.3.19':
    case '2.16.840.1.101.3.4.3.20':
    case '2.16.840.1.101.3.4.3.21':
    case '2.16.840.1.101.3.4.3.22':
    case '2.16.840.1.101.3.4.3.23':
    case '2.16.840.1.101.3.4.3.24':
    case '2.16.840.1.101.3.4.3.25':
    case '2.16.840.1.101.3.4.3.26':
    case '2.16.840.1.101.3.4.3.27':
    case '2.16.840.1.101.3.4.3.28':
    case '2.16.840.1.101.3.4.3.29':
    case '2.16.840.1.101.3.4.3.30':
    case '2.16.840.1.101.3.4.3.31':
      throw x509Error(
        'channel binding is not supported by Postgres for certificates signed with Ed25519, Ed448, ML-DSA or SLH-DSA'
      )
  }
  throw x509Error('unknown certificate signature OID ' + oid, data)
}

module.exports = { signatureAlgorithmHashFromCertificate }

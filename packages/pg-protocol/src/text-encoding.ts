// The encodings supported by both PostgreSQL and Node.js
export const enum TextEncoding {
  UTF8 = 'utf8',
  LATIN1 = 'latin1',
}

export function parseEncoding(encoding?: string): TextEncoding {
  const normalizedValue = encoding && encoding.replace(/[^a-z0-9]/gi, '').toLowerCase()
  if (!normalizedValue || normalizedValue === TextEncoding.UTF8) {
    return TextEncoding.UTF8
  } else if (normalizedValue === TextEncoding.LATIN1) {
    return TextEncoding.LATIN1
  } else {
    throw new RangeError(`invalid encoding "${encoding}". Supported encodings are "UTF8" and "LATIN1".`)
  }
}

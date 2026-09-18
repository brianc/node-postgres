const fromCharCode = String.fromCharCode

// Longest value decoded without calling into buffer.toString(). Above this
// length the per-call cost of toString() is cheaper than decoding in JS.
const MAX_ASCII_LENGTH = 16

// Most values in a result set are short: ids, flags, small numbers, dates. For
// those the fixed cost of the C++ call behind buffer.toString() is bigger than
// the decoding itself, so build the string from the char codes instead.
// Returns undefined when the bytes are not ASCII, so the caller falls back to
// buffer.toString().
// prettier-ignore
const decodeAscii = (b: Buffer, i: number, length: number): string | undefined => {
  let bits = 0
  for (let k = 0; k < length; k++) {
    bits |= b[i + k]
  }
  if (bits > 127) {
    return undefined
  }
  switch (length) {
    case 0: return ''
    case 1: return fromCharCode(b[i])
    case 2: return fromCharCode(b[i], b[i + 1])
    case 3: return fromCharCode(b[i], b[i + 1], b[i + 2])
    case 4: return fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3])
    case 5: return fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3], b[i + 4])
    case 6: return fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3], b[i + 4], b[i + 5])
    case 7: return fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3], b[i + 4], b[i + 5], b[i + 6])
    case 8: return fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3], b[i + 4], b[i + 5], b[i + 6], b[i + 7])
    case 9: return fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3], b[i + 4], b[i + 5], b[i + 6], b[i + 7], b[i + 8])
    case 10: return fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3], b[i + 4], b[i + 5], b[i + 6], b[i + 7], b[i + 8], b[i + 9])
    case 11: return fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3], b[i + 4], b[i + 5], b[i + 6], b[i + 7], b[i + 8], b[i + 9], b[i + 10])
    case 12: return fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3], b[i + 4], b[i + 5], b[i + 6], b[i + 7], b[i + 8], b[i + 9], b[i + 10], b[i + 11])
    case 13: return fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3], b[i + 4], b[i + 5], b[i + 6], b[i + 7], b[i + 8], b[i + 9], b[i + 10], b[i + 11], b[i + 12])
    case 14: return fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3], b[i + 4], b[i + 5], b[i + 6], b[i + 7], b[i + 8], b[i + 9], b[i + 10], b[i + 11], b[i + 12], b[i + 13])
    case 15: return fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3], b[i + 4], b[i + 5], b[i + 6], b[i + 7], b[i + 8], b[i + 9], b[i + 10], b[i + 11], b[i + 12], b[i + 13], b[i + 14])
    case 16: return fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3], b[i + 4], b[i + 5], b[i + 6], b[i + 7], b[i + 8], b[i + 9], b[i + 10], b[i + 11], b[i + 12], b[i + 13], b[i + 14], b[i + 15])
  }
  return undefined
}

export class BufferReader {
  private buffer: Buffer = Buffer.allocUnsafe(0)

  // TODO(bmc): support non-utf8 encoding?
  private encoding: BufferEncoding = 'utf-8'

  constructor(private offset: number = 0) {}

  public setBuffer(offset: number, buffer: Buffer): void {
    this.offset = offset
    this.buffer = buffer
  }

  public int16(): number {
    const result = this.buffer.readInt16BE(this.offset)
    this.offset += 2
    return result
  }

  public byte(): number {
    const result = this.buffer[this.offset]
    this.offset++
    return result
  }

  public int32(): number {
    const result = this.buffer.readInt32BE(this.offset)
    this.offset += 4
    return result
  }

  public uint32(): number {
    const result = this.buffer.readUInt32BE(this.offset)
    this.offset += 4
    return result
  }

  public string(length: number): string {
    const start = this.offset
    this.offset = start + length
    if (length <= MAX_ASCII_LENGTH) {
      const ascii = decodeAscii(this.buffer, start, length)
      if (ascii !== undefined) {
        return ascii
      }
    }
    return this.buffer.toString(this.encoding, start, this.offset)
  }

  public cstring(): string {
    const start = this.offset
    let end = start
    // eslint-disable-next-line no-empty
    while (this.buffer[end++]) {}
    this.offset = end
    return this.buffer.toString(this.encoding, start, end - 1)
  }

  public bytes(length: number): Buffer {
    const result = this.buffer.slice(this.offset, this.offset + length)
    this.offset += length
    return result
  }
}

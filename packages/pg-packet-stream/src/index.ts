import { Transform, TransformCallback, TransformOptions } from 'stream';
import assert from 'assert'

export const hello = () => 'Hello world!'

// this is a single byte
const CODE_LENGTH = 1;
// this is a Uint32
const LEN_LENGTH = 4;

export type Packet = {
  code: number;
  packet: Buffer;
}

type FieldFormat = "text" | "binary"

class Field {
  constructor(public name: string) {

  }

}

const emptyBuffer = Buffer.allocUnsafe(0);

class BufferReader {
  private buffer: Buffer = emptyBuffer;
  constructor(private offset: number = 0) {

  }

  public setBuffer(offset: number, buffer: Buffer): void {
    this.offset = offset;
    this.buffer = buffer;
  }

  public int16() {
    const result = this.buffer.readInt16BE(this.offset);
    this.offset += 2;
    return result;
  }

  public int32() {
    const result = this.buffer.readInt32BE(this.offset);
    this.offset += 4;
    return result;
  }

  public string(length: number): string {
    // TODO(bmc): support non-utf8 encoding
    const result = this.buffer.toString('utf8', this.offset, this.offset + length)
    this.offset += length;
    return result;
  }

  public bytes(length: number): Buffer {
    const result = this.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return result
  }
}

type Mode = 'text' | 'binary';

type StreamOptions = TransformOptions & {
  mode: Mode
}

const parseComplete = {
  name: 'parseComplete',
  length: 5,
};

const bindComplete = {
  name: 'bindComplete',
  length: 5,
}

const closeComplete = {
  name: 'closeComplete',
  length: 5,
}

export class PgPacketStream extends Transform {
  private remainingBuffer: Buffer = emptyBuffer;
  private reader = new BufferReader();
  private mode: Mode;

  constructor(opts: StreamOptions) {
    super({
      ...opts,
      readableObjectMode: true
    })
    if (opts.mode === 'binary') {
      throw new Error('Binary mode not supported yet')
    }
    this.mode = opts.mode;
  }

  public _transform(buffer: Buffer, encoding: string, callback: TransformCallback) {
    const combinedBuffer = this.remainingBuffer.byteLength ? Buffer.concat([this.remainingBuffer, buffer], this.remainingBuffer.length + buffer.length) : buffer;
    let offset = 0;
    while ((offset + CODE_LENGTH + LEN_LENGTH) <= combinedBuffer.byteLength) {
      // code is 1 byte long - it identifies the message type
      const code = combinedBuffer[offset];

      // length is 1 Uint32BE - it is the length of the message EXCLUDING the code
      const length = combinedBuffer.readUInt32BE(offset + CODE_LENGTH);

      const fullMessageLength = CODE_LENGTH + length;

      if (fullMessageLength + offset <= combinedBuffer.byteLength) {
        this.handlePacket(offset, code, length, combinedBuffer);
        offset += fullMessageLength;
      } else {
        break;
      }
    }

    if (offset === combinedBuffer.byteLength) {
      this.remainingBuffer = emptyBuffer;
    } else {
      this.remainingBuffer = combinedBuffer.slice(offset)
    }

    callback(null);
  }

  private handlePacket(offset: number, code: number, length: number, combinedBuffer: Buffer) {
    switch (code) {
      case 0x44: // D
        this.parseDataRowMessage(offset, length, combinedBuffer);
        break;
      case 0x32: // 2
        this.emit('message', bindComplete);
        break;
      case 0x31: // 1
        this.emit('message', parseComplete);
        break;
      case 0x33: // 3
        this.emit('message', closeComplete);
        break;
      default:
        const packet = combinedBuffer.slice(offset, CODE_LENGTH + length + offset)
        this.push({ code, length, packet, buffer: packet.slice(5) })
    }
  }

  public _flush(callback: TransformCallback) {
  }

  private parseDataRowMessage(offset: number, length: number, bytes: Buffer) {
    this.reader.setBuffer(offset + 5, bytes);
    const fieldCount = this.reader.int16();
    const fields: any[] = new Array(fieldCount);
    for (let i = 0; i < fieldCount; i++) {
      const len = this.reader.int32();
      if (len === -1) {
        fields[i] = null
      } else if (this.mode === 'text') {
        fields[i] = this.reader.string(len)
      }
    }
    const message = new DataRowMessage(length, fields);
    this.emit('message', message);
  }
}


class DataRowMessage {
  public readonly fieldCount: number;
  public readonly name: string = 'dataRow'
  constructor(public length: number, public fields: any[]) {
    this.fieldCount = fields.length;
  }
}

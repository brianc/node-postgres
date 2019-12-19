import { Transform, TransformCallback, TransformOptions } from 'stream';

// every message is prefixed with a single bye
const CODE_LENGTH = 1;
// every message has an int32 length which includes itself but does
// NOT include the code in the length
const LEN_LENGTH = 4;

export type Packet = {
  code: number;
  packet: Buffer;
}

type FieldFormat = "text" | "binary"

const emptyBuffer = Buffer.allocUnsafe(0);

class BufferReader {
  private buffer: Buffer = emptyBuffer;
  // TODO(bmc): support non-utf8 encoding
  private encoding: string = 'utf-8';
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
    const result = this.buffer.toString(this.encoding, this.offset, this.offset + length)
    this.offset += length;
    return result;
  }

  public cstring(): string {
    var start = this.offset
    var end = this.buffer.indexOf(0, start)
    this.offset = end + 1
    return this.buffer.toString(this.encoding, start, end)

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

const noData = {
  name: 'noData',
  length: 5
}

const portalSuspended = {
  name: 'portalSuspended',
  length: 5,
}

const replicationStart = {
  name: 'replicationStart',
  length: 4,
}

const emptyQuery = {
  name: 'emptyQuery',
  length: 4,
}

enum MessageCodes {
  DataRow = 0x44, // D
  ParseComplete = 0x31, // 1
  BindComplete = 0x32, // 2
  CloseComplete = 0x33, // 3
  CommandComplete = 0x43, // C
  ReadyForQuery = 0x5a, // Z
  NoData = 0x6e, // n
  NotificationResponse = 0x41, // A
  AuthenticationResponse = 0x52, // R
  ParameterStatus = 0x53, // S
  BackendKeyData = 0x4b, // K
  ErrorMessage = 0x45, // E
  NoticeMessage = 0x4e, // N
  RowDescriptionMessage = 0x54, // T
  PortalSuspended = 0x73, // s
  ReplicationStart = 0x57, // W
  EmptyQuery = 0x49, // I
}

export class PgPacketStream extends Transform {
  private remainingBuffer: Buffer = emptyBuffer;
  private reader = new BufferReader();
  private mode: Mode;

  constructor(opts?: StreamOptions) {
    super({
      ...opts,
      readableObjectMode: true
    })
    if (opts?.mode === 'binary') {
      throw new Error('Binary mode not supported yet')
    }
    this.mode = opts?.mode || 'text';
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
        this.handlePacket(offset + CODE_LENGTH + LEN_LENGTH, code, length, combinedBuffer);
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

  private handlePacket(offset: number, code: number, length: number, bytes: Buffer) {
    switch (code) {
      case MessageCodes.DataRow:
        this.parseDataRowMessage(offset, length, bytes);
        break;
      case MessageCodes.BindComplete:
        this.emit('message', bindComplete);
        break;
      case MessageCodes.ParseComplete:
        this.emit('message', parseComplete);
        break;
      case MessageCodes.CloseComplete:
        this.emit('message', closeComplete);
        break;
      case MessageCodes.NoData:
        this.emit('message', noData);
        break;
      case MessageCodes.PortalSuspended:
        this.emit('message', portalSuspended);
        break;
      case MessageCodes.CommandComplete:
        this.parseCommandCompleteMessage(offset, length, bytes);
        break;
      case MessageCodes.ReplicationStart:
        this.emit('message', replicationStart);
        break;
      case MessageCodes.EmptyQuery:
        this.emit('message', emptyQuery);
        break;
      case MessageCodes.ReadyForQuery:
        this.parseReadyForQueryMessage(offset, length, bytes);
        break;
      case MessageCodes.NotificationResponse:
        this.parseNotificationMessage(offset, length, bytes);
        break;
      case MessageCodes.AuthenticationResponse:
        this.parseAuthenticationResponse(offset, length, bytes);
        break;
      case MessageCodes.ParameterStatus:
        this.parseParameterStatusMessage(offset, length, bytes);
        break;
      case MessageCodes.BackendKeyData:
        this.parseBackendKeyData(offset, length, bytes);
        break;
      case MessageCodes.ErrorMessage:
        this.parseErrorMessage(offset, length, bytes, 'error');
        break;
      case MessageCodes.NoticeMessage:
        this.parseErrorMessage(offset, length, bytes, 'notice');
        break;
      case MessageCodes.RowDescriptionMessage:
        this.parseRowDescriptionMessage(offset, length, bytes);
        break;
      default:
        throw new Error('unhanled code: ' + code.toString(16))
        const packet = bytes.slice(offset, CODE_LENGTH + length + offset)
        this.push({ code, length, packet, buffer: packet.slice(5) })
    }
  }

  public _flush(callback: TransformCallback) {
  }

  private parseReadyForQueryMessage(offset: number, length: number, bytes: Buffer) {
    this.reader.setBuffer(offset, bytes);
    const status = this.reader.string(1);
    const message = new ReadyForQueryMessage(length, status)
    this.emit('message', message)
  }

  private parseCommandCompleteMessage(offset: number, length: number, bytes: Buffer) {
    this.reader.setBuffer(offset, bytes);
    const text = this.reader.cstring();
    const message = new CommandCompleteMessage(length, text);
    this.emit('message', message)
  }

  private parseNotificationMessage(offset: number, length: number, bytes: Buffer) {
    this.reader.setBuffer(offset, bytes);
    const processId = this.reader.int32();
    const channel = this.reader.cstring();
    const payload = this.reader.cstring();
    const message = new NotificationResponseMessage(length, processId, channel, payload);
    this.emit('message', message)
  }

  private parseRowDescriptionMessage(offset: number, length: number, bytes: Buffer) {
    this.reader.setBuffer(offset, bytes);
    const fieldCount = this.reader.int16()
    const message = new RowDescriptionMessage(length, fieldCount);
    for (let i = 0; i < fieldCount; i++) {
      message.fields[i] = this.parseField()
    }
    this.emit('message', message);
  }

  private parseField(): Field {
    const name = this.reader.cstring()
    const tableID = this.reader.int32()
    const columnID = this.reader.int16()
    const dataTypeID = this.reader.int32()
    const dataTypeSize = this.reader.int16()
    const dataTypeModifier = this.reader.int32()
    const mode = this.reader.int16() === 0 ? 'text' : 'binary';
    return new Field(name, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, mode)
  }

  private parseDataRowMessage(offset: number, length: number, bytes: Buffer) {
    this.reader.setBuffer(offset, bytes);
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

  private parseParameterStatusMessage(offset: number, length: number, bytes: Buffer) {
    this.reader.setBuffer(offset, bytes);
    const name = this.reader.cstring();
    const value = this.reader.cstring()
    const msg = new ParameterStatusMessage(length, name, value)
    this.emit('message', msg)
  }

  private parseBackendKeyData(offset: number, length: number, bytes: Buffer) {
    this.reader.setBuffer(offset, bytes);
    const processID = this.reader.int32()
    const secretKey = this.reader.int32()
    const msg = new BackendKeyDataMessage(length, processID, secretKey)
    this.emit('message', msg)
  }


  public parseAuthenticationResponse(offset: number, length: number, bytes: Buffer) {
    this.reader.setBuffer(offset, bytes);
    const code = this.reader.int32()
    // TODO(bmc): maybe better types here
    const msg: any = {
      name: 'authenticationOk',
      length,
    };

    switch (code) {
      case 0: // AuthenticationOk
        break;
      case 3: // AuthenticationCleartextPassword
        if (msg.length === 8) {
          msg.name = 'authenticationCleartextPassword'
        }
        break
      case 5: // AuthenticationMD5Password
        if (msg.length === 12) {
          msg.name = 'authenticationMD5Password'
          msg.salt = this.reader.bytes(4);
        }
        break
      case 10: // AuthenticationSASL
        msg.name = 'authenticationSASL'
        msg.mechanisms = []
        let mechanism: string;
        do {
          mechanism = this.reader.cstring()

          if (mechanism) {
            msg.mechanisms.push(mechanism)
          }
        } while (mechanism)
        break;
      case 11: // AuthenticationSASLContinue
        msg.name = 'authenticationSASLContinue'
        msg.data = this.reader.string(length - 4)
        break;
      case 12: // AuthenticationSASLFinal
        msg.name = 'authenticationSASLFinal'
        msg.data = this.reader.string(length - 4)
        break;
      default:
        throw new Error('Unknown authenticationOk message type ' + code)
    }
    this.emit('message', msg)
  }

  private parseErrorMessage(offset: number, length: number, bytes: Buffer, name: string) {
    this.reader.setBuffer(offset, bytes);
    var fields: Record<string, string> = {}
    var fieldType = this.reader.string(1)
    while (fieldType !== '\0') {
      fields[fieldType] = this.reader.cstring()
      fieldType = this.reader.string(1)
    }

    // the msg is an Error instance
    var msg = new DatabaseError(fields.M, length, name)

    msg.severity = fields.S
    msg.code = fields.C
    msg.detail = fields.D
    msg.hint = fields.H
    msg.position = fields.P
    msg.internalPosition = fields.p
    msg.internalQuery = fields.q
    msg.where = fields.W
    msg.schema = fields.s
    msg.table = fields.t
    msg.column = fields.c
    msg.dataType = fields.d
    msg.constraint = fields.n
    msg.file = fields.F
    msg.line = fields.L
    msg.routine = fields.R
    this.emit('message', msg);

  }
}

class DatabaseError extends Error {
  public severity: string | undefined;
  public code: string | undefined;
  public detail: string | undefined;
  public hint: string | undefined;
  public position: string | undefined;
  public internalPosition: string | undefined;
  public internalQuery: string | undefined;
  public where: string | undefined;
  public schema: string | undefined;
  public table: string | undefined;
  public column: string | undefined;
  public dataType: string | undefined;
  public constraint: string | undefined;
  public file: string | undefined;
  public line: string | undefined;
  public routine: string | undefined;
  constructor(message: string, public readonly length: number, public readonly name: string) {
    super(message)
  }
}

class Field {
  constructor(public readonly name: string, public readonly tableID: number, public readonly columnID: number, public readonly dataTypeID: number, public readonly dataTypeSize: number, public readonly dataTypeModifier: number, public readonly format: FieldFormat) {
  }
}

class RowDescriptionMessage {
  public readonly name: string = 'rowDescription';
  public readonly fields: Field[];
  constructor(public readonly length: number, public readonly fieldCount: number) {
    this.fields = new Array(this.fieldCount)
  }
}

class ParameterStatusMessage {
  public readonly name: string = 'parameterStatus';
  constructor(public readonly length: number, public readonly parameterName: string, public readonly parameterValue: string) {

  }
}

class BackendKeyDataMessage {
  public readonly name: string = 'backendKeyData';
  constructor(public readonly length: number, public readonly processID: number, public readonly secretKey: number) {
  }
}

class NotificationResponseMessage {
  public readonly name: string = 'notification';
  constructor(public readonly length: number, public readonly processId: number, public readonly channel: string, public readonly payload: string) {
  }
}

class ReadyForQueryMessage {
  public readonly name: string = 'readyForQuery';
  constructor(public readonly length: number, public readonly status: string) {
  }
}

class CommandCompleteMessage {
  public readonly name: string = 'commandComplete'
  constructor(public readonly length: number, public readonly text: string) {
  }
}

class DataRowMessage {
  public readonly fieldCount: number;
  public readonly name: string = 'dataRow'
  constructor(public length: number, public fields: any[]) {
    this.fieldCount = fields.length;
  }
}

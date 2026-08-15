import { TransformOptions } from 'stream'
import {
  Mode,
  bindComplete,
  parseComplete,
  closeComplete,
  noData,
  portalSuspended,
  copyDone,
  replicationStart,
  emptyQuery,
  ReadyForQueryMessage,
  CommandCompleteMessage,
  CopyDataMessage,
  CopyResponse,
  NotificationResponseMessage,
  RowDescriptionMessage,
  ParameterDescriptionMessage,
  Field,
  DataRowMessage,
  ParameterStatusMessage,
  BackendKeyDataMessage,
  DatabaseError,
  BackendMessage,
  MessageName,
  AuthenticationMD5Password,
  NoticeMessage,
} from './messages'
import { BufferReader } from './buffer-reader'

// every message is prefixed with a single byte
const CODE_LENGTH = 1
// every message has an int32 length which includes itself but does
// NOT include the code in the length
const LEN_LENGTH = 4

const HEADER_LENGTH = CODE_LENGTH + LEN_LENGTH

// A placeholder for a `BackendMessage`’s length value that will be set after construction.
const LATEINIT_LENGTH = -1

// How much of a straddling message’s claimed length we are willing to allocate up front. Beyond
// this the buffer grows as the bytes actually arrive, so that a bogus length in a corrupt stream
// cannot ask for an enormous allocation.
const MAX_EAGER_MESSAGE_LENGTH = 1024 * 1024

export type Packet = {
  code: number
  packet: Buffer
}

const emptyBuffer = Buffer.allocUnsafe(0)

type StreamOptions = TransformOptions & {
  mode: Mode
}

const enum MessageCodes {
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
  ParameterDescriptionMessage = 0x74, // t
  PortalSuspended = 0x73, // s
  ReplicationStart = 0x57, // W
  EmptyQuery = 0x49, // I
  CopyIn = 0x47, // G
  CopyOut = 0x48, // H
  CopyDone = 0x63, // c
  CopyData = 0x64, // d
}

export type MessageCallback = (msg: BackendMessage) => void

/**
 * Parses the backend’s messages out of the chunks the socket delivers.
 *
 * A chunk is however many bytes one socket read returned, which has nothing to do with where
 * messages begin and end: the backend writes a continuous stream of length-prefixed messages, so
 * unless a read happens to land exactly on a message boundary it ends part way through one — which,
 * for a result of any size, is nearly every read. A message can also be longer than a single read
 * (a wide row, or one large cell), and then spans several chunks. Only the message at the tail of a
 * chunk can be incomplete, though, so at most one message per chunk needs bytes from another one.
 *
 * That message is reassembled into a buffer of its own; every other message is parsed in place, as
 * a view over the chunk it arrived in. Neither buffer is ever written to again, so a message stays
 * valid for as long as it is held — and holding one holds the whole chunk it came from.
 */
export class Parser {
  // The bytes of a message that straddles two chunks, i.e. only ever one message’s worth. Every
  // other message is parsed in place, out of the chunk it arrived in.
  private partial: Buffer = emptyBuffer
  private partialLength: number = 0
  // The straddling message’s full length, or -1 while its own header is still incomplete.
  private partialTotal: number = -1
  private reader = new BufferReader()
  private mode: Mode

  constructor(opts?: StreamOptions) {
    if (opts?.mode === 'binary') {
      throw new Error('Binary mode not supported yet')
    }
    this.mode = opts?.mode || 'text'
  }

  public parse(chunk: Buffer, callback: MessageCallback) {
    const chunkLength = chunk.byteLength
    // finish the message the previous chunk cut in half, if any, before parsing this one
    let offset = this.partialLength > 0 ? this.completePartial(chunk, callback) : 0
    while (offset + HEADER_LENGTH <= chunkLength) {
      // code is 1 byte long - it identifies the message type
      const code = chunk[offset]
      // length is 1 Uint32BE - it is the length of the message EXCLUDING the code
      const length = chunk.readUInt32BE(offset + CODE_LENGTH)
      const fullMessageLength = CODE_LENGTH + length
      if (fullMessageLength + offset <= chunkLength) {
        const message = this.handlePacket(offset + HEADER_LENGTH, code, length, chunk)
        callback(message)
        offset += fullMessageLength
      } else {
        break
      }
    }
    if (offset < chunkLength) {
      this.startPartial(chunk, offset)
    }
  }

  /** Copies the trailing bytes of `chunk` that do not yet form a whole message into their own buffer. */
  private startPartial(chunk: Buffer, offset: number): void {
    const remaining = chunk.byteLength - offset
    this.partial = emptyBuffer
    this.partialLength = 0
    // the length is only known once the header is complete
    this.partialTotal = remaining >= HEADER_LENGTH ? CODE_LENGTH + chunk.readUInt32BE(offset + CODE_LENGTH) : -1
    this.growPartial(remaining)
    chunk.copy(this.partial, 0, offset)
    this.partialLength = remaining
  }

  /**
   * Fills the straddling message from the head of `chunk` and emits it once whole, returning the
   * offset in `chunk` where parsing continues.
   */
  private completePartial(chunk: Buffer, callback: MessageCallback): number {
    let consumed = 0
    if (this.partialTotal === -1) {
      // the header itself was split, so complete it before its length can be read
      consumed = Math.min(HEADER_LENGTH - this.partialLength, chunk.byteLength)
      chunk.copy(this.partial, this.partialLength, 0, consumed)
      this.partialLength += consumed
      if (this.partialLength < HEADER_LENGTH) {
        return consumed
      }
      this.partialTotal = CODE_LENGTH + this.partial.readUInt32BE(CODE_LENGTH)
    }
    if (this.partialLength < this.partialTotal) {
      const available = Math.min(this.partialTotal - this.partialLength, chunk.byteLength - consumed)
      this.growPartial(this.partialLength + available)
      chunk.copy(this.partial, this.partialLength, consumed, consumed + available)
      this.partialLength += available
      consumed += available
      if (this.partialLength < this.partialTotal) {
        return consumed
      }
    }
    // hand the buffer off to the message and forget it, so that nothing is ever parsed twice out
    // of the same bytes and the message stays valid for as long as it is held
    const partial = this.partial
    this.partial = emptyBuffer
    this.partialLength = 0
    this.partialTotal = -1
    const message = this.handlePacket(HEADER_LENGTH, partial[0], partial.readUInt32BE(CODE_LENGTH), partial)
    callback(message)
    return consumed
  }

  /** Sizes `partial` to hold at least `needed` bytes, i.e. the whole message when its length is known. */
  private growPartial(needed: number): void {
    if (needed <= this.partial.byteLength) {
      return
    }
    // grow geometrically, jumping straight to the message's full length when that is known and
    // modest, and always keeping room for the header its length is read from
    const whole = this.partialTotal === -1 ? HEADER_LENGTH : Math.min(this.partialTotal, MAX_EAGER_MESSAGE_LENGTH)
    let capacity = Math.max(needed, whole, this.partial.byteLength * 2)
    if (this.partialTotal !== -1 && capacity > this.partialTotal) {
      capacity = this.partialTotal
    }
    const grown = Buffer.allocUnsafe(capacity)
    this.partial.copy(grown, 0, 0, this.partialLength)
    this.partial = grown
  }

  private handlePacket(offset: number, code: number, length: number, bytes: Buffer): BackendMessage {
    const { reader } = this

    // NOTE: This undesirably retains the buffer in `this.reader` if the `parse*Message` calls below throw. However, those should only throw in the case of a protocol error, which normally results in the reader being discarded.
    reader.setBuffer(offset, bytes)

    let message: BackendMessage

    switch (code) {
      case MessageCodes.BindComplete:
        message = bindComplete
        break
      case MessageCodes.ParseComplete:
        message = parseComplete
        break
      case MessageCodes.CloseComplete:
        message = closeComplete
        break
      case MessageCodes.NoData:
        message = noData
        break
      case MessageCodes.PortalSuspended:
        message = portalSuspended
        break
      case MessageCodes.CopyDone:
        message = copyDone
        break
      case MessageCodes.ReplicationStart:
        message = replicationStart
        break
      case MessageCodes.EmptyQuery:
        message = emptyQuery
        break
      case MessageCodes.DataRow:
        // the cells are decoded lazily, on the first read of `message.fields`
        message = new DataRowMessage(LATEINIT_LENGTH, bytes, offset)
        break
      case MessageCodes.CommandComplete:
        message = parseCommandCompleteMessage(reader)
        break
      case MessageCodes.ReadyForQuery:
        message = parseReadyForQueryMessage(reader)
        break
      case MessageCodes.NotificationResponse:
        message = parseNotificationMessage(reader)
        break
      case MessageCodes.AuthenticationResponse:
        message = parseAuthenticationResponse(reader, length)
        break
      case MessageCodes.ParameterStatus:
        message = parseParameterStatusMessage(reader)
        break
      case MessageCodes.BackendKeyData:
        message = parseBackendKeyData(reader)
        break
      case MessageCodes.ErrorMessage:
        message = parseErrorMessage(reader, 'error')
        break
      case MessageCodes.NoticeMessage:
        message = parseErrorMessage(reader, 'notice')
        break
      case MessageCodes.RowDescriptionMessage:
        message = parseRowDescriptionMessage(reader)
        break
      case MessageCodes.ParameterDescriptionMessage:
        message = parseParameterDescriptionMessage(reader)
        break
      case MessageCodes.CopyIn:
        message = parseCopyInMessage(reader)
        break
      case MessageCodes.CopyOut:
        message = parseCopyOutMessage(reader)
        break
      case MessageCodes.CopyData:
        message = parseCopyData(reader, length)
        break
      default:
        return new DatabaseError('received invalid response: ' + code.toString(16), length, 'error')
    }

    reader.setBuffer(0, emptyBuffer)

    message.length = length
    return message
  }
}

const parseReadyForQueryMessage = (reader: BufferReader) => {
  const status = reader.string(1)
  return new ReadyForQueryMessage(LATEINIT_LENGTH, status)
}

const parseCommandCompleteMessage = (reader: BufferReader) => {
  const text = reader.cstring()
  return new CommandCompleteMessage(LATEINIT_LENGTH, text)
}

const parseCopyData = (reader: BufferReader, length: number) => {
  const chunk = reader.bytes(length - 4)
  return new CopyDataMessage(LATEINIT_LENGTH, chunk)
}

const parseCopyInMessage = (reader: BufferReader) => parseCopyMessage(reader, 'copyInResponse')

const parseCopyOutMessage = (reader: BufferReader) => parseCopyMessage(reader, 'copyOutResponse')

const parseCopyMessage = (reader: BufferReader, messageName: MessageName) => {
  const isBinary = reader.byte() !== 0
  const columnCount = reader.int16()
  const message = new CopyResponse(LATEINIT_LENGTH, messageName, isBinary, columnCount)
  for (let i = 0; i < columnCount; i++) {
    message.columnTypes[i] = reader.int16()
  }
  return message
}

const parseNotificationMessage = (reader: BufferReader) => {
  const processId = reader.int32()
  const channel = reader.cstring()
  const payload = reader.cstring()
  return new NotificationResponseMessage(LATEINIT_LENGTH, processId, channel, payload)
}

const parseRowDescriptionMessage = (reader: BufferReader) => {
  const fieldCount = reader.int16()
  const message = new RowDescriptionMessage(LATEINIT_LENGTH, fieldCount)
  for (let i = 0; i < fieldCount; i++) {
    message.fields[i] = parseField(reader)
  }
  return message
}

const parseField = (reader: BufferReader) => {
  const name = reader.cstring()
  const tableID = reader.uint32()
  const columnID = reader.int16()
  const dataTypeID = reader.uint32()
  const dataTypeSize = reader.int16()
  const dataTypeModifier = reader.int32()
  const mode = reader.int16() === 0 ? 'text' : 'binary'
  return new Field(name, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, mode)
}

const parseParameterDescriptionMessage = (reader: BufferReader) => {
  const parameterCount = reader.int16()
  const message = new ParameterDescriptionMessage(LATEINIT_LENGTH, parameterCount)
  for (let i = 0; i < parameterCount; i++) {
    // OIDs are unsigned, same as dataTypeID in parseField above
    message.dataTypeIDs[i] = reader.uint32()
  }
  return message
}

const parseParameterStatusMessage = (reader: BufferReader) => {
  const name = reader.cstring()
  const value = reader.cstring()
  return new ParameterStatusMessage(LATEINIT_LENGTH, name, value)
}

const parseBackendKeyData = (reader: BufferReader) => {
  const processID = reader.int32()
  const secretKey = reader.int32()
  return new BackendKeyDataMessage(LATEINIT_LENGTH, processID, secretKey)
}

const parseAuthenticationResponse = (reader: BufferReader, length: number) => {
  const code = reader.int32()
  // TODO(bmc): maybe better types here
  const message: BackendMessage & any = {
    name: 'authenticationOk',
    length,
  }

  switch (code) {
    case 0: // AuthenticationOk
      break
    case 3: // AuthenticationCleartextPassword
      if (message.length === 8) {
        message.name = 'authenticationCleartextPassword'
      }
      break
    case 5: // AuthenticationMD5Password
      if (message.length === 12) {
        message.name = 'authenticationMD5Password'
        const salt = reader.bytes(4)
        return new AuthenticationMD5Password(LATEINIT_LENGTH, salt)
      }
      break
    case 10: // AuthenticationSASL
      {
        message.name = 'authenticationSASL'
        message.mechanisms = []
        let mechanism: string
        do {
          mechanism = reader.cstring()
          if (mechanism) {
            message.mechanisms.push(mechanism)
          }
        } while (mechanism)
      }
      break
    case 11: // AuthenticationSASLContinue
      message.name = 'authenticationSASLContinue'
      message.data = reader.string(length - 8)
      break
    case 12: // AuthenticationSASLFinal
      message.name = 'authenticationSASLFinal'
      message.data = reader.string(length - 8)
      break
    default:
      throw new Error('Unknown authenticationOk message type ' + code)
  }
  return message
}

const parseErrorMessage = (reader: BufferReader, name: MessageName) => {
  const fields: Record<string, string> = {}
  let fieldType = reader.string(1)
  while (fieldType !== '\0') {
    fields[fieldType] = reader.cstring()
    fieldType = reader.string(1)
  }

  const messageValue = fields.M

  const message =
    name === 'notice'
      ? new NoticeMessage(LATEINIT_LENGTH, messageValue)
      : new DatabaseError(messageValue, LATEINIT_LENGTH, name)

  message.severity = fields.S
  message.code = fields.C
  message.detail = fields.D
  message.hint = fields.H
  message.position = fields.P
  message.internalPosition = fields.p
  message.internalQuery = fields.q
  message.where = fields.W
  message.schema = fields.s
  message.table = fields.t
  message.column = fields.c
  message.dataType = fields.d
  message.constraint = fields.n
  message.file = fields.F
  message.line = fields.L
  message.routine = fields.R
  return message
}

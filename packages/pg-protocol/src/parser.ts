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
import {
  DbosTupleDesc,
  NzTypeInt,
  NzTypeInt1,
  NzTypeInt2,
  NzTypeInt8,
  NzTypeDouble,
  NzTypeFloat,
  NzTypeBool,
} from './netezza-types'

// every message is prefixed with a single bye
const CODE_LENGTH = 1
// every message has an int32 length which includes itself but does
// NOT include the code in the length
const LEN_LENGTH = 4

// Netezza has 4 extra bytes between code and length
const NETEZZA_OFFSET = 4
const NETEZZA_HEADER_LENGTH = CODE_LENGTH + NETEZZA_OFFSET + LEN_LENGTH

// A placeholder for a `BackendMessage`’s length value that will be set after construction.
const LATEINIT_LENGTH = -1

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
  NetezzaPortalName = 0x50, // P - Netezza-specific portal name message
  NetezzaDbosTupleDescriptor = 0x58, // X - Netezza DBOS tuple descriptor message
  NetezzaDbosDataTuple = 0x59, // Y - Netezza DBOS data tuple message
}

export type MessageCallback = (msg: BackendMessage) => void

export class Parser {
  private buffer: Buffer = emptyBuffer
  private bufferLength: number = 0
  private bufferOffset: number = 0
  private reader = new BufferReader()
  private mode: Mode
  private fieldCount: number = 0 // Track field count from RowDescription for DataRow parsing
  private dbosTupleDesc: DbosTupleDesc | null = null // Netezza DBOS tuple descriptor

  constructor(opts?: StreamOptions) {
    if (opts?.mode === 'binary') {
      throw new Error('Binary mode not supported yet')
    }
    this.mode = opts?.mode || 'text'
  }

  public parse(buffer: Buffer, callback: MessageCallback) {
    this.mergeBuffer(buffer)
    const bufferFullLength = this.bufferOffset + this.bufferLength
    let offset = this.bufferOffset
    while (offset + NETEZZA_HEADER_LENGTH <= bufferFullLength) {
      // code is 1 byte long - it identifies the message type
      const code = this.buffer[offset]
      // length is 1 Uint32BE - it INCLUDES itself (4 bytes) but EXCLUDES code (1 byte) and command number (4 bytes)
      const length = this.buffer.readUInt32BE(offset + CODE_LENGTH + NETEZZA_OFFSET)

      if (process.env.DEBUG_PARSER) {
        console.log(
          `[Parser] offset=${offset}, code=0x${code.toString(16)} ('${String.fromCharCode(
            code
          )}'), length=${length}, bufferFullLength=${bufferFullLength}`
        )
        console.log(
          `[Parser] Next 20 bytes:`,
          this.buffer.slice(offset, Math.min(offset + 20, bufferFullLength)).toString('hex')
        )
      }

      // Full message = code (1) + command (4) + length field (4) + data (length bytes)
      const fullMessageLength = CODE_LENGTH + NETEZZA_OFFSET + LEN_LENGTH + length

      // Validate length is reasonable (not negative, not absurdly large)
      // Max reasonable message is 100MB
      if (length < 0 || length > 100 * 1024 * 1024) {
        if (process.env.DEBUG_PARSER) {
          console.log(`[Parser] Invalid length ${length}, stopping parse loop`)
        }
        break
      }

      // Check if we have the complete message
      if (fullMessageLength + offset <= bufferFullLength) {
        const message = this.handlePacket(offset + NETEZZA_HEADER_LENGTH, code, length, this.buffer)
        callback(message)
        offset += fullMessageLength
      } else {
        // Not enough data for complete message, wait for more
        break
      }
    }
    if (offset === bufferFullLength) {
      // No more use for the buffer
      this.buffer = emptyBuffer
      this.bufferLength = 0
      this.bufferOffset = 0
    } else {
      // Adjust the cursors of remainingBuffer
      this.bufferLength = bufferFullLength - offset
      this.bufferOffset = offset
    }
  }

  private mergeBuffer(buffer: Buffer): void {
    if (this.bufferLength > 0) {
      const newLength = this.bufferLength + buffer.byteLength
      const newFullLength = newLength + this.bufferOffset
      if (newFullLength > this.buffer.byteLength) {
        // We can't concat the new buffer with the remaining one
        let newBuffer: Buffer
        if (newLength <= this.buffer.byteLength && this.bufferOffset >= this.bufferLength) {
          // We can move the relevant part to the beginning of the buffer instead of allocating a new buffer
          newBuffer = this.buffer
        } else {
          // Allocate a new larger buffer
          let newBufferLength = this.buffer.byteLength * 2
          while (newLength >= newBufferLength) {
            newBufferLength *= 2
          }
          newBuffer = Buffer.allocUnsafe(newBufferLength)
        }
        // Move the remaining buffer to the new one
        this.buffer.copy(newBuffer, 0, this.bufferOffset, this.bufferOffset + this.bufferLength)
        this.buffer = newBuffer
        this.bufferOffset = 0
      }
      // Concat the new buffer with the remaining one
      buffer.copy(this.buffer, this.bufferOffset + this.bufferLength)
      this.bufferLength = newLength
    } else {
      this.buffer = buffer
      this.bufferOffset = 0
      this.bufferLength = buffer.byteLength
    }
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
        message = parseDataRowMessage(reader, this.fieldCount)
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
        message = parseErrorMessage(reader, length, 'error')
        break
      case MessageCodes.NoticeMessage:
        message = parseErrorMessage(reader, length, 'notice')
        break
      case MessageCodes.RowDescriptionMessage:
        message = parseRowDescriptionMessage(reader)
        // Store field count for DataRow parsing
        this.fieldCount = (message as RowDescriptionMessage).fieldCount
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
      case MessageCodes.NetezzaPortalName:
        // Netezza-specific: Portal name message
        // Just read and discard the portal name for now
        message = parseNetezzaPortalName(reader)
        break
      case MessageCodes.NetezzaDbosTupleDescriptor:
        // Netezza-specific: DBOS tuple descriptor message
        // This describes the structure of DBOS data tuples that follow
        message = parseNetezzaDbosTupleDescriptor(reader, length)
        // Store the tuple descriptor for use with DBOS data rows
        if ((message as any).tupdesc) {
          this.dbosTupleDesc = (message as any).tupdesc
        }
        break
      case MessageCodes.NetezzaDbosDataTuple:
        // Netezza-specific: DBOS data tuple message
        // Parse it as a DataRow with DBOS format using the stored tuple descriptor
        message = parseDbosDataRow(reader, this.fieldCount, length, this.dbosTupleDesc)
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
    message.fields[i] = parseNetezzaField(reader)
  }
  return message
}

const parseNetezzaField = (reader: BufferReader) => {
  // Netezza field format (simpler than PostgreSQL):
  // - cstring (name)
  // - uint32 (OID/dataTypeID)
  // - int16 (length/dataTypeSize)
  // - int32 (modifier/dataTypeModifier)
  // - byte (format: 0=text, 1=binary)
  const name = reader.cstring()
  const dataTypeID = reader.uint32()
  const dataTypeSize = reader.int16()
  const dataTypeModifier = reader.int32()
  const formatByte = reader.byte()
  const mode = formatByte === 0 ? 'text' : 'binary'

  // Netezza doesn't provide tableID and columnID, so use 0
  const tableID = 0
  const columnID = 0

  return new Field(name, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, mode)
}

const parseParameterDescriptionMessage = (reader: BufferReader) => {
  const parameterCount = reader.int16()
  const message = new ParameterDescriptionMessage(LATEINIT_LENGTH, parameterCount)
  for (let i = 0; i < parameterCount; i++) {
    message.dataTypeIDs[i] = reader.int32()
  }
  return message
}

const parseDataRowMessage = (reader: BufferReader, fieldCount: number) => {
  // Netezza DataRow format: for each field:
  // - 1 byte flag (0x80 or higher = non-null, 0x00 = null)
  // - If non-null: 4 bytes int32 length (includes the 4 bytes itself) + N bytes data
  // - If null: NO length field, just move to next field

  const fields: any[] = new Array(fieldCount)

  for (let i = 0; i < fieldCount; i++) {
    const flag = reader.byte()

    // Debug logging
    if (process.env.DEBUG_DATAROW) {
      console.log(`[DataRow] Field ${i}: flag=0x${flag.toString(16)}`)
    }

    // Check if null: flag is 0x00
    if (flag === 0x00) {
      // Null field - no length or data to read
      fields[i] = null
      if (process.env.DEBUG_DATAROW) {
        console.log(`[DataRow] Field ${i}: NULL`)
      }
    } else {
      // Non-null field - read length and data
      const length = reader.int32()
      const dataLength = length - 4

      if (process.env.DEBUG_DATAROW) {
        console.log(`[DataRow] Field ${i}: length=${length}, dataLength=${dataLength}`)
      }

      if (dataLength > 0) {
        fields[i] = reader.string(dataLength)
        if (process.env.DEBUG_DATAROW) {
          console.log(`[DataRow] Field ${i} value:`, fields[i])
        }
      } else {
        fields[i] = ''
      }
    }
  }

  return new DataRowMessage(LATEINIT_LENGTH, fields)
}
const parseNetezzaDbosTupleDescriptor = (reader: BufferReader, length: number) => {
  // Netezza DBOS Tuple Descriptor format (message code 'X'):
  // Based on nzpy core.py Res_get_dbos_column_descriptions (lines 1984-2012)

  if (process.env.DEBUG_DATAROW) {
    console.log(`[DBOS TupleDescriptor] message length=${length}`)
  }

  // The entire message content is the descriptor data
  // Read all remaining bytes as the descriptor
  const data = reader.bytes(length - 4) // Subtract 4 for the length field itself

  // Parse the tuple descriptor structure
  const tupdesc = new DbosTupleDesc()
  let dataIdx = 0

  // Read header fields (9 int32 values = 36 bytes)
  tupdesc.version = data.readInt32BE(dataIdx)
  tupdesc.nullsAllowed = data.readInt32BE(dataIdx + 4)
  tupdesc.sizeWord = data.readInt32BE(dataIdx + 8)
  tupdesc.sizeWordSize = data.readInt32BE(dataIdx + 12)
  tupdesc.numFixedFields = data.readInt32BE(dataIdx + 16)
  tupdesc.numVaryingFields = data.readInt32BE(dataIdx + 20)
  tupdesc.fixedFieldsSize = data.readInt32BE(dataIdx + 24)
  tupdesc.maxRecordSize = data.readInt32BE(dataIdx + 28)
  tupdesc.numFields = data.readInt32BE(dataIdx + 32)

  dataIdx += 36

  // Read field descriptors (9 int32 values per field = 36 bytes per field)
  for (let ix = 0; ix < tupdesc.numFields; ix++) {
    tupdesc.field_type.push(data.readInt32BE(dataIdx))
    tupdesc.field_size.push(data.readInt32BE(dataIdx + 4))
    tupdesc.field_trueSize.push(data.readInt32BE(dataIdx + 8))
    tupdesc.field_offset.push(data.readInt32BE(dataIdx + 12))
    tupdesc.field_physField.push(data.readInt32BE(dataIdx + 16))
    tupdesc.field_logField.push(data.readInt32BE(dataIdx + 20))
    tupdesc.field_nullAllowed.push(data.readInt32BE(dataIdx + 24))
    tupdesc.field_fixedSize.push(data.readInt32BE(dataIdx + 28))
    tupdesc.field_springField.push(data.readInt32BE(dataIdx + 32))
    dataIdx += 36
  }

  // Read footer fields
  tupdesc.DateStyle = data.readInt32BE(dataIdx)
  tupdesc.EuroDates = data.readInt32BE(dataIdx + 4)

  if (process.env.DEBUG_DATAROW) {
    console.log(`[DBOS TupleDescriptor] numFields=${tupdesc.numFields}, fixedFieldsSize=${tupdesc.fixedFieldsSize}`)
    for (let i = 0; i < tupdesc.numFields; i++) {
      console.log(
        `[DBOS TupleDescriptor] Field ${i}: type=${tupdesc.field_type[i]}, size=${tupdesc.field_size[i]}, offset=${tupdesc.field_offset[i]}, fixedSize=${tupdesc.field_fixedSize[i]}`
      )
    }
  }

  // Return the tuple descriptor wrapped in a message
  // We'll store this in the parser for use with 'Y' messages
  return {
    name: 'dbosTupleDescriptor' as MessageName,
    length: LATEINIT_LENGTH,
    tupdesc,
  }
}

const parseDbosDataRow = (
  reader: BufferReader,
  fieldCount: number,
  messageLength: number,
  tupdesc: DbosTupleDesc | null
) => {
  // Netezza DBOS DataRow format (message code 'Y'):
  // Based on nzpy core.py Res_read_dbos_tuple (line 2013-2021)

  // First 4 bytes are the record length (big-endian)
  const recordLength = reader.int32()

  if (process.env.DEBUG_DATAROW) {
    console.log(`[DBOS DataRow] fieldCount=${fieldCount}, recordLength=${recordLength}`)
  }

  // Read the data tuple
  const tupleData = reader.bytes(recordLength)

  // If we don't have a tuple descriptor, fall back to simple parsing
  if (!tupdesc) {
    if (process.env.DEBUG_DATAROW) {
      console.log(`[DBOS DataRow] No tuple descriptor available, using simple parsing`)
    }
    // Use the simple parsing logic below
  }

  // DBOS format: 2-byte length prefix + 1-byte bitmap + 1-byte padding + field data
  // Skip 2-byte length prefix
  let offset = 2

  // Calculate bitmap length (1 bit per field, rounded up to bytes)
  const bitmapLen = Math.ceil(fieldCount / 8)

  // Read null bitmap
  const bitmap = tupleData.slice(offset, offset + bitmapLen)
  offset += bitmapLen

  // Skip 1-byte padding after bitmap (Netezza alignment)
  offset += 1

  if (process.env.DEBUG_DATAROW) {
    console.log(`[DBOS DataRow] Bitmap:`, bitmap.toString('hex'))
    console.log(`[DBOS DataRow] Starting data offset: ${offset}`)
    console.log(`[DBOS DataRow] Tuple data hex:`, tupleData.toString('hex'))
  }

  const fields: any[] = new Array(fieldCount)

  // Data section starts after the bitmap and padding
  const dataStart = offset
  // Variable fields start after fixed fields
  // Note: fixedFieldsSize includes a 4-byte header that's not in our data, so subtract it
  const actualFixedSize = tupdesc ? Math.max(0, tupdesc.fixedFieldsSize - 4) : 0
  let varOffset = dataStart + actualFixedSize

  for (let i = 0; i < fieldCount; i++) {
    // Check if field is null using bitmap (bit=1 means NULL in Netezza)
    const byteIndex = Math.floor(i / 8)
    const bitIndex = i % 8
    const isNull = (bitmap[byteIndex] & (1 << bitIndex)) !== 0

    if (isNull) {
      fields[i] = null
      if (process.env.DEBUG_DATAROW) {
        console.log(`[DBOS DataRow] Field ${i}: NULL`)
      }
    } else if (tupdesc && i < tupdesc.numFields) {
      // Use tuple descriptor to parse field correctly
      const fieldType = tupdesc.field_type[i]
      const fieldSize = tupdesc.field_size[i]
      const isFixedSize = tupdesc.field_fixedSize[i] === 1

      if (process.env.DEBUG_DATAROW) {
        console.log(`[DBOS DataRow] Field ${i}: type=${fieldType}, size=${fieldSize}, fixedSize=${isFixedSize}`)
      }

      if (isFixedSize) {
        // Fixed-size field: offset is relative to data start
        // Note: Netezza includes a 4-byte header in the fixed section, so we need to subtract it
        const fieldOffset = tupdesc.field_offset[i]
        // The offset in tupdesc includes the 4-byte header, but our data doesn't have it
        // So we subtract 4 from the offset
        const adjustedOffset = fieldOffset >= 4 ? fieldOffset - 4 : fieldOffset
        const absoluteOffset = dataStart + adjustedOffset

        if (process.env.DEBUG_DATAROW) {
          console.log(
            `[DBOS DataRow] Field ${i}: reading from fixed offset ${absoluteOffset} (dataStart=${dataStart}, fieldOffset=${fieldOffset}, adjusted=${adjustedOffset})`
          )
        }

        // Parse based on type
        if (fieldType === NzTypeInt) {
          // INT32
          if (absoluteOffset + 4 <= tupleData.length) {
            fields[i] = tupleData.readInt32LE(absoluteOffset)
          } else {
            fields[i] = null
          }
        } else if (fieldType === NzTypeInt2) {
          // INT16
          if (absoluteOffset + 2 <= tupleData.length) {
            fields[i] = tupleData.readInt16LE(absoluteOffset)
          } else {
            fields[i] = null
          }
        } else if (fieldType === NzTypeInt1) {
          // INT8
          if (absoluteOffset + 1 <= tupleData.length) {
            fields[i] = tupleData.readInt8(absoluteOffset)
          } else {
            fields[i] = null
          }
        } else if (fieldType === NzTypeInt8) {
          // INT64
          if (absoluteOffset + 8 <= tupleData.length) {
            // Read as BigInt and convert to string for compatibility
            fields[i] = tupleData.readBigInt64LE(absoluteOffset).toString()
          } else {
            fields[i] = null
          }
        } else if (fieldType === NzTypeDouble) {
          if (absoluteOffset + 8 <= tupleData.length) {
            fields[i] = tupleData.readDoubleLE(absoluteOffset)
          } else {
            fields[i] = null
          }
        } else if (fieldType === NzTypeFloat) {
          if (absoluteOffset + 4 <= tupleData.length) {
            fields[i] = tupleData.readFloatLE(absoluteOffset)
          } else {
            fields[i] = null
          }
        } else if (fieldType === NzTypeBool) {
          if (absoluteOffset + 1 <= tupleData.length) {
            fields[i] = tupleData[absoluteOffset] !== 0
          } else {
            fields[i] = null
          }
        } else {
          // Unknown fixed-size type, read as buffer
          if (absoluteOffset + fieldSize <= tupleData.length) {
            fields[i] = tupleData.slice(absoluteOffset, absoluteOffset + fieldSize).toString('utf8')
          } else {
            fields[i] = null
          }
        }
      } else {
        // Variable-size field: read from variable offset with 2-byte length prefix
        // Note: Netezza uses LITTLE-ENDIAN for variable field length prefix
        if (varOffset + 2 <= tupleData.length) {
          const fieldLength = tupleData.readUInt16LE(varOffset)

          if (process.env.DEBUG_DATAROW) {
            console.log(`[DBOS DataRow] Field ${i}: reading from var offset ${varOffset}, length=${fieldLength}`)
          }

          if (fieldLength >= 2 && varOffset + fieldLength <= tupleData.length) {
            // Length includes the 2-byte length prefix itself
            const dataLength = fieldLength - 2
            fields[i] = tupleData.slice(varOffset + 2, varOffset + 2 + dataLength).toString('utf8')
            varOffset += fieldLength
          } else {
            fields[i] = ''
            varOffset += 2
          }
        } else {
          fields[i] = ''
        }
      }

      if (process.env.DEBUG_DATAROW) {
        console.log(`[DBOS DataRow] Field ${i} value:`, fields[i])
      }
    } else {
      // Fallback: assume variable-length field with 2-byte length prefix
      const remainingData = tupleData.slice(offset)

      if (remainingData.length < 2) {
        fields[i] = ''
        if (process.env.DEBUG_DATAROW) {
          console.log(`[DBOS DataRow] Field ${i}: (insufficient data)`)
        }
        continue
      }

      const fieldLength = remainingData.readUInt16LE(0)

      if (fieldLength >= 2 && remainingData.length >= fieldLength) {
        fields[i] = remainingData.slice(2, fieldLength).toString('utf8')
        offset += fieldLength
      } else {
        fields[i] = ''
        offset += 2
      }

      if (process.env.DEBUG_DATAROW) {
        console.log(`[DBOS DataRow] Field ${i}: ${fields[i]}`)
      }
    }
  }

  return new DataRowMessage(LATEINIT_LENGTH, fields)
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

const parseNetezzaPortalName = (reader: BufferReader) => {
  // Netezza portal name message - just read and discard the portal name
  const portalName = reader.cstring()
  // Return a simple message indicating portal name was received
  return {
    name: 'netezzaPortalName' as MessageName,
    length: LATEINIT_LENGTH,
    portalName,
  }
}

const parseErrorMessage = (reader: BufferReader, length: number, name: MessageName) => {
  const startOffset = reader['offset']
  const endOffset = startOffset + length - 4 // Subtract 4 for the length field itself

  // Read the entire message as a null-terminated string
  const messageValue = reader.cstring()

  if (process.env.DEBUG_PARSER && name === 'notice') {
    console.log(`[Parser] Netezza ${name} message:`, messageValue)
  }

  const message =
    name === 'notice'
      ? new NoticeMessage(LATEINIT_LENGTH, messageValue)
      : new DatabaseError(messageValue, LATEINIT_LENGTH, name)

  // Netezza doesn't provide detailed error fields like PostgreSQL
  // Set basic fields from the message text if needed
  message.severity = name === 'notice' ? 'NOTICE' : 'ERROR'

  const fields: Record<string, string> = {}
  while (reader['offset'] < endOffset) {
    const fieldType = reader.byte()
    if (fieldType === 0) {
      break
    }
    const fieldTypeChar = String.fromCharCode(fieldType)
    const fieldValue = reader.cstring()
    fields[fieldTypeChar] = fieldValue
  }

  // Populate any additional fields if they were present
  message.code = fields.C // C for SQLSTATE code
  message.detail = fields.D // D for detail
  message.hint = fields.H // H for hint
  message.position = fields.P // P for position
  message.internalPosition = fields.p // p for internal position
  message.internalQuery = fields.q // q for internal query
  message.where = fields.W // W for where
  message.schema = fields.s // s for schema name
  message.table = fields.t // t for table name
  message.column = fields.c // c for column name
  message.dataType = fields.d // d for data type name
  message.constraint = fields.n // n for constraint name
  message.file = fields.F // F for file
  message.line = fields.L // L for line
  message.routine = fields.R // R for routine

  return message
}

import { Writer } from './buffer-writer'

const enum code {
  startup = 0x70,
  query = 0x51,
  parse = 0x50,
  bind = 0x42,
  execute = 0x45,
  flush = 0x48,
  sync = 0x53,
  end = 0x58,
  close = 0x43,
  describe = 0x44,
  copyFromChunk = 0x64,
  copyDone = 0x63,
  copyFail = 0x66,
}

const writer = new Writer()

const startup = (opts: Record<string, string>): Buffer => {
  // protocol version
  writer.addInt16(3).addInt16(0)
  for (const key of Object.keys(opts)) {
    writer.addCString(key).addCString(opts[key])
  }

  writer.addCString('client_encoding').addCString('UTF8')

  const bodyBuffer = writer.addCString('').flush()
  // this message is sent without a code

  const length = bodyBuffer.length + 4

  return new Writer().addInt32(length).add(bodyBuffer).flush()
}

const requestSsl = (): Buffer => {
  const response = Buffer.allocUnsafe(8)
  response.writeInt32BE(8, 0)
  response.writeInt32BE(80877103, 4)
  return response
}

const password = (password: string): Buffer => {
  return writer.addCString(password).flush(code.startup)
}

const sendSASLInitialResponseMessage = function (mechanism: string, initialResponse: string): Buffer {
  // 0x70 = 'p'
  writer.addCString(mechanism).addInt32PrefixedString(initialResponse)

  return writer.flush(code.startup)
}

const sendSCRAMClientFinalMessage = function (additionalData: string): Buffer {
  return writer.addString(additionalData).flush(code.startup)
}

const query = (text: string): Buffer => {
  return writer.addCString(text).flush(code.query)
}

type ParseOpts = {
  name?: string
  types?: number[]
  text: string
}

const emptyArray: any[] = []

const parse = (query: ParseOpts): Buffer => {
  // expect something like this:
  // { name: 'queryName',
  //   text: 'select * from blah',
  //   types: ['int8', 'bool'] }

  // normalize missing query names to allow for null
  const name = query.name || ''
  if (name.length > 63) {
    console.error('Warning! Postgres only supports 63 characters for query names.')
    console.error('You supplied %s (%s)', name, name.length)
    console.error('This can cause conflicts and silent errors executing queries')
  }

  const types = query.types || emptyArray

  const len = types.length

  const buffer = writer
    .addCString(name) // name of query
    .addCString(query.text) // actual query text
    .addInt16(len)

  for (let i = 0; i < len; i++) {
    buffer.addInt32(types[i])
  }

  return writer.flush(code.parse)
}

type ValueMapper = (param: any, index: number) => any

type BindOpts = {
  portal?: string
  binary?: boolean
  statement?: string
  values?: any[]
  // optional map from JS value to postgres value per parameter
  valueMapper?: ValueMapper
}

// make this a const enum so typescript will inline the value
const enum ParamType {
  STRING = 0,
  BINARY = 1,
}

const writeValues = function (values: any[], valueMapper: ValueMapper | undefined, formatsOffset: number): void {
  const len = values.length
  for (let i = 0; i < len; i++) {
    const mappedVal = valueMapper ? valueMapper(values[i], i) : values[i]
    let formatByte = ParamType.STRING

    if (mappedVal == null) {
      // write -1 to indicate null
      writer.addInt32(-1)
    } else if (mappedVal instanceof Buffer) {
      formatByte = ParamType.BINARY

      // add the buffer to the param writer
      writer.addInt32(mappedVal.length)
      writer.add(mappedVal)
    } else {
      // length prefix + UTF-8 bytes in one pass (Buffer.byteLength computed once)
      writer.addInt32PrefixedString(mappedVal)
    }

    // beware: `writer` operations can replace `writer.buffer` with a new buffer
    const buf = writer.buffer
    buf[formatsOffset++] = 0
    buf[formatsOffset++] = formatByte
  }
}

const bind = (config: BindOpts = {}): Buffer => {
  // normalize config
  const portal = config.portal || ''
  const statement = config.statement || ''
  const binary = config.binary || false
  const values = config.values || emptyArray
  const len = values.length

  writer.addCString(portal).addCString(statement)

  // number of parameter format codes
  writer.addInt16(len)

  // space for those codes, filled by `writeValues`
  const formatsOffset = writer.reserveUnsafe(len * 2)

  // number of parameter values
  writer.addInt16(len)

  try {
    writeValues(values, config.valueMapper, formatsOffset)
  } catch (err) {
    writer.clear()
    throw err
  }

  // all results use the same format code
  writer.addInt16(1)
  // format code
  writer.addInt16(binary ? ParamType.BINARY : ParamType.STRING)
  return writer.flush(code.bind)
}

type ExecOpts = {
  portal?: string
  rows?: number
}

const emptyExecute = Buffer.from([code.execute, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x00, 0x00])

const execute = (config?: ExecOpts): Buffer => {
  // this is the happy path for most queries
  if (!config || (!config.portal && !config.rows)) {
    return emptyExecute
  }

  const portal = config.portal || ''
  const rows = config.rows || 0

  const portalLength = Buffer.byteLength(portal)
  const len = 4 + portalLength + 1 + 4
  // one extra bit for code
  const buff = Buffer.allocUnsafe(1 + len)
  buff[0] = code.execute
  buff.writeInt32BE(len, 1)
  buff.write(portal, 5, 'utf-8')
  buff[portalLength + 5] = 0 // null terminate portal cString
  buff.writeUInt32BE(rows, buff.length - 4)
  return buff
}

const cancel = (processID: number, secretKey: number): Buffer => {
  const buffer = Buffer.allocUnsafe(16)
  buffer.writeInt32BE(16, 0)
  buffer.writeInt16BE(1234, 4)
  buffer.writeInt16BE(5678, 6)
  buffer.writeInt32BE(processID, 8)
  buffer.writeInt32BE(secretKey, 12)
  return buffer
}

type PortalOpts = {
  type: 'S' | 'P'
  name?: string
}

const cstringMessage = (code: code, string: string): Buffer => {
  const stringLen = Buffer.byteLength(string)
  const len = 4 + stringLen + 1
  // one extra bit for code
  const buffer = Buffer.allocUnsafe(1 + len)
  buffer[0] = code
  buffer.writeInt32BE(len, 1)
  buffer.write(string, 5, 'utf-8')
  buffer[len] = 0 // null terminate cString
  return buffer
}

const emptyDescribePortal = writer.addCString('P').flush(code.describe)
const emptyDescribeStatement = writer.addCString('S').flush(code.describe)

const describe = (msg: PortalOpts): Buffer => {
  return msg.name
    ? cstringMessage(code.describe, `${msg.type}${msg.name || ''}`)
    : msg.type === 'P'
    ? emptyDescribePortal
    : emptyDescribeStatement
}

const close = (msg: PortalOpts): Buffer => {
  const text = `${msg.type}${msg.name || ''}`
  return cstringMessage(code.close, text)
}

const copyData = (chunk: Buffer): Buffer => {
  return writer.add(chunk).flush(code.copyFromChunk)
}

const copyFail = (message: string): Buffer => {
  return cstringMessage(code.copyFail, message)
}

const codeOnlyBuffer = (code: code): Buffer => Buffer.from([code, 0x00, 0x00, 0x00, 0x04])

const flushBuffer = codeOnlyBuffer(code.flush)
const syncBuffer = codeOnlyBuffer(code.sync)
const endBuffer = codeOnlyBuffer(code.end)
const copyDoneBuffer = codeOnlyBuffer(code.copyDone)

const serialize = {
  startup,
  password,
  requestSsl,
  sendSASLInitialResponseMessage,
  sendSCRAMClientFinalMessage,
  query,
  parse,
  bind,
  execute,
  describe,
  close,
  flush: () => flushBuffer,
  sync: () => syncBuffer,
  end: () => endBuffer,
  copyData,
  copyDone: () => copyDoneBuffer,
  copyFail,
  cancel,
}

export { serialize }

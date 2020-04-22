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

  var bodyBuffer = writer.addCString('').flush()
  // this message is sent without a code

  var length = bodyBuffer.length + 4

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
  writer.addCString(mechanism).addInt32(Buffer.byteLength(initialResponse)).addString(initialResponse)

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
    /* eslint-disable no-console */
    console.error('Warning! Postgres only supports 63 characters for query names.')
    console.error('You supplied %s (%s)', name, name.length)
    console.error('This can cause conflicts and silent errors executing queries')
    /* eslint-enable no-console */
  }

  const types = query.types || emptyArray

  var len = types.length

  var buffer = writer
    .addCString(name) // name of query
    .addCString(query.text) // actual query text
    .addInt16(len)

  for (var i = 0; i < len; i++) {
    buffer.addInt32(types[i])
  }

  return writer.flush(code.parse)
}

type BindOpts = {
  portal?: string
  binary?: boolean
  statement?: string
  values?: any[]
}

const bind = (config: BindOpts = {}): Buffer => {
  // normalize config
  const portal = config.portal || ''
  const statement = config.statement || ''
  const binary = config.binary || false
  var values = config.values || emptyArray
  var len = values.length

  var useBinary = false
  // TODO(bmc): all the loops in here aren't nice, we can do better
  for (var j = 0; j < len; j++) {
    useBinary = useBinary || values[j] instanceof Buffer
  }

  var buffer = writer.addCString(portal).addCString(statement)
  if (!useBinary) {
    buffer.addInt16(0)
  } else {
    buffer.addInt16(len)
    for (j = 0; j < len; j++) {
      buffer.addInt16(values[j] instanceof Buffer ? 1 : 0)
    }
  }
  buffer.addInt16(len)
  for (var i = 0; i < len; i++) {
    var val = values[i]
    if (val === null || typeof val === 'undefined') {
      buffer.addInt32(-1)
    } else if (val instanceof Buffer) {
      buffer.addInt32(val.length)
      buffer.add(val)
    } else {
      buffer.addInt32(Buffer.byteLength(val))
      buffer.addString(val)
    }
  }

  if (binary) {
    buffer.addInt16(1) // format codes to use binary
    buffer.addInt16(1)
  } else {
    buffer.addInt16(0) // format codes to use text
  }
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

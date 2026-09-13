'use strict'

// The pg-protocol parser against the bytes it was given, and against itself.
//
// A round is a random sequence of backend messages, written here byte by byte from the protocol
// description, so what every message should parse to is known before the parser sees it. The
// bytes are then parsed twice: in one buffer, and cut into chunks at random points, the way a
// socket delivers them. Both parses must give the messages that were written. A chunk boundary
// inside a header, inside a field, or one byte before the end is where a parser keeps state, and
// the hand written tests cover three such cuts.
//
//   node fuzz/wire.js                  a hundred rounds
//   node fuzz/wire.js --seed 12345     replay what a past run did
//   node fuzz/wire.js --keep-going     do not stop at the first divergence

const { Parser } = require('../packages/pg-protocol/dist/parser')
const { int, pick, chance, string, bytes, canon, main } = require('./lib')

const int32 = (n) => {
  const b = Buffer.alloc(4)
  b.writeInt32BE(n)
  return b
}
const uint32 = (n) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}
const int16 = (n) => {
  const b = Buffer.alloc(2)
  b.writeInt16BE(n)
  return b
}
const cstring = (s) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])])
// one message: the type byte, the length of everything after the type byte, the body
const message = (code, ...parts) => {
  const body = Buffer.concat(parts)
  return Buffer.concat([Buffer.from(code), int32(body.length + 4), body])
}

// the error and notice fields the parser reads, by the type byte the protocol gives them
const ERROR_FIELDS = {
  S: 'severity',
  C: 'code',
  M: 'message',
  D: 'detail',
  H: 'hint',
  P: 'position',
  p: 'internalPosition',
  q: 'internalQuery',
  W: 'where',
  s: 'schema',
  t: 'table',
  c: 'column',
  d: 'dataType',
  n: 'constraint',
  F: 'file',
  L: 'line',
  R: 'routine',
}

// each kind draws a message and returns its bytes and what parsing them must give. Only the
// properties listed in `expect` are compared, since the parser adds `length` and the classes
// carry more than the protocol does
const KINDS = {
  readyForQuery: (rng) => {
    const status = pick(rng, ['I', 'T', 'E'])
    return { bytes: message('Z', Buffer.from(status)), expect: { name: 'readyForQuery', status } }
  },
  commandComplete: (rng) => {
    const text = pick(rng, ['SELECT 1', 'INSERT 0 1', 'UPDATE 0', 'BEGIN', 'COPY 12', string(rng, 40)])
    return { bytes: message('C', cstring(text)), expect: { name: 'commandComplete', text } }
  },
  dataRow: (rng) => {
    const fields = Array.from({ length: int(rng, 0, 20) }, () => (chance(rng, 0.2) ? null : string(rng, 30)))
    const parts = [int16(fields.length)]
    for (const field of fields) {
      if (field === null) parts.push(int32(-1))
      else {
        const buf = Buffer.from(field, 'utf8')
        parts.push(int32(buf.length), buf)
      }
    }
    return { bytes: message('D', ...parts), expect: { name: 'dataRow', fields } }
  },
  rowDescription: (rng) => {
    const fields = Array.from({ length: int(rng, 0, 12) }, () => ({
      name: string(rng),
      tableID: chance(rng, 0.3) ? int(rng, 0x80000000, 0xffffffff) : int(rng, 0, 100000),
      columnID: int(rng, -1, 3000),
      dataTypeID: chance(rng, 0.3) ? int(rng, 0x80000000, 0xffffffff) : pick(rng, [23, 25, 16, 1184, 3802, 114]),
      dataTypeSize: pick(rng, [-1, 1, 2, 4, 8, 16]),
      dataTypeModifier: pick(rng, [-1, 0, 104, 2147483647]),
      format: pick(rng, ['text', 'binary']),
    }))
    const parts = [int16(fields.length)]
    for (const f of fields) {
      parts.push(
        cstring(f.name),
        uint32(f.tableID),
        int16(f.columnID),
        uint32(f.dataTypeID),
        int16(f.dataTypeSize),
        int32(f.dataTypeModifier),
        int16(f.format === 'text' ? 0 : 1)
      )
    }
    return { bytes: message('T', ...parts), expect: { name: 'rowDescription', fieldCount: fields.length, fields } }
  },
  parameterDescription: (rng) => {
    const dataTypeIDs = Array.from({ length: int(rng, 0, 8) }, () => int(rng, 0, 0xffffffff))
    return {
      bytes: message('t', int16(dataTypeIDs.length), ...dataTypeIDs.map(uint32)),
      expect: { name: 'parameterDescription', parameterCount: dataTypeIDs.length, dataTypeIDs },
    }
  },
  parameterStatus: (rng) => {
    const parameterName = string(rng)
    const parameterValue = string(rng)
    return {
      bytes: message('S', cstring(parameterName), cstring(parameterValue)),
      expect: { name: 'parameterStatus', parameterName, parameterValue },
    }
  },
  backendKeyData: (rng) => {
    const processID = int(rng, 0, 0x7fffffff)
    const secretKey = int(rng, -0x80000000, 0x7fffffff)
    return {
      bytes: message('K', int32(processID), int32(secretKey)),
      expect: { name: 'backendKeyData', processID, secretKey },
    }
  },
  notification: (rng) => {
    const processId = int(rng, 0, 0x7fffffff)
    const channel = string(rng)
    const payload = string(rng, 60)
    return {
      bytes: message('A', int32(processId), cstring(channel), cstring(payload)),
      expect: { name: 'notification', processId, channel, payload },
    }
  },
  errorOrNotice: (rng) => {
    const name = pick(rng, ['error', 'notice'])
    const fields = {}
    const expect = { name }
    for (const [type, prop] of Object.entries(ERROR_FIELDS)) {
      if (type === 'M' || chance(rng, 0.3)) {
        fields[type] = string(rng, 30)
        expect[prop] = fields[type]
      }
    }
    const parts = Object.entries(fields).flatMap(([type, value]) => [Buffer.from(type), cstring(value)])
    return { bytes: message(name === 'error' ? 'E' : 'N', ...parts, Buffer.from([0])), expect }
  },
  empty: (rng) => {
    const [code, name] = pick(rng, [
      ['1', 'parseComplete'],
      ['2', 'bindComplete'],
      ['3', 'closeComplete'],
      ['n', 'noData'],
      ['s', 'portalSuspended'],
      ['I', 'emptyQuery'],
      ['c', 'copyDone'],
      ['W', 'replicationStart'],
    ])
    return { bytes: message(code), expect: { name } }
  },
  authentication: (rng) => {
    const code = pick(rng, [0, 3, 5, 10, 11, 12])
    if (code === 0) return { bytes: message('R', int32(0)), expect: { name: 'authenticationOk' } }
    if (code === 3) return { bytes: message('R', int32(3)), expect: { name: 'authenticationCleartextPassword' } }
    if (code === 5) {
      const salt = bytes(rng, 4)
      if (salt.length !== 4) return { bytes: message('R', int32(0)), expect: { name: 'authenticationOk' } }
      return { bytes: message('R', int32(5), salt), expect: { name: 'authenticationMD5Password', salt } }
    }
    if (code === 10) {
      const mechanisms = Array.from({ length: int(rng, 1, 3) }, () =>
        pick(rng, ['SCRAM-SHA-256', 'SCRAM-SHA-256-PLUS'])
      )
      return {
        bytes: message('R', int32(10), ...mechanisms.map(cstring), Buffer.from([0])),
        expect: { name: 'authenticationSASL', mechanisms },
      }
    }
    const data = string(rng, 40)
    return {
      bytes: message('R', int32(code), Buffer.from(data, 'utf8')),
      expect: { name: code === 11 ? 'authenticationSASLContinue' : 'authenticationSASLFinal', data },
    }
  },
  copyResponse: (rng) => {
    const name = pick(rng, ['copyInResponse', 'copyOutResponse'])
    const binary = chance(rng, 0.5)
    const columnTypes = Array.from({ length: int(rng, 0, 6) }, () => (binary ? 1 : 0))
    return {
      bytes: message(
        name === 'copyInResponse' ? 'G' : 'H',
        Buffer.from([binary ? 1 : 0]),
        int16(columnTypes.length),
        ...columnTypes.map(int16)
      ),
      expect: { name, binary, columnTypes },
    }
  },
  copyData: (rng) => {
    const chunk = bytes(rng, 200)
    return { bytes: message('d', chunk), expect: { name: 'copyData', chunk } }
  },
  // a type byte the parser does not know: it must answer an error and go on with the next message
  unknown: (rng) => {
    const code = pick(rng, ['X', 'Q', 'x', '?'])
    return {
      bytes: message(code, bytes(rng, 8)),
      expect: { name: 'error', message: `received invalid response: ${code.charCodeAt(0).toString(16)}` },
    }
  },
}
const NAMES = Object.keys(KINDS)

// how the bytes are cut: at random points, and with a bias to the first bytes of a message, where
// the header is, and to cuts one byte apart
const cuts = (rng, total) => {
  const points = new Set()
  const count = int(rng, 0, Math.min(total, 40))
  for (let i = 0; i < count; i++) {
    const at = chance(rng, 0.3) ? int(rng, 1, Math.min(total - 1, 6)) : int(rng, 1, total - 1)
    points.add(at)
    if (chance(rng, 0.3) && at + 1 < total) points.add(at + 1)
  }
  return [...points].sort((a, b) => a - b)
}

const draw = (rng) => {
  const messages = Array.from({ length: int(rng, 1, 30) }, () => KINDS[pick(rng, NAMES)](rng))
  const total = Buffer.concat(messages.map((m) => m.bytes)).length
  return { messages, cuts: total > 1 ? cuts(rng, total) : [] }
}

// what the parser gave, with only the properties the protocol promised, so it compares against
// the expectation and between the two parses
const observed = (parsed, expect) => {
  const out = {}
  for (const key of Object.keys(expect)) out[key] = parsed ? parsed[key] : undefined
  return out
}

// what each message must parse to, in the sequence it is in: a column the last row description
// declared binary comes back as its bytes, the others as text
const expectations = (messages) => {
  let binaryColumns = []
  return messages.map(({ expect }) => {
    if (expect.name === 'rowDescription') binaryColumns = expect.fields.map((f) => f.format === 'binary')
    if (expect.name !== 'dataRow') return expect
    const fields = expect.fields.map((field, i) =>
      field !== null && binaryColumns[i] ? Buffer.from(field, 'utf8') : field
    )
    return { ...expect, fields }
  })
}

const parseAll = (chunks, expects) => {
  const parser = new Parser()
  const out = []
  for (const chunk of chunks) parser.parse(chunk, (msg) => out.push(msg))
  return out.map((msg, i) => observed(msg, expects[i] || { name: true }))
}

const run = async (plan) => {
  const whole = Buffer.concat(plan.messages.map((m) => m.bytes))
  const expects = expectations(plan.messages)
  const chunks = []
  let from = 0
  for (const at of [...plan.cuts, whole.length]) {
    // a copy per chunk, as a socket gives one: the parser may keep it
    chunks.push(Buffer.from(whole.subarray(from, at)))
    from = at
  }
  const arms = { whole: parseAll([whole], expects), chunked: parseAll(chunks, expects) }
  for (const [arm, got] of Object.entries(arms)) {
    if (got.length !== expects.length) {
      return `${arm}: ${got.length} messages parsed, ${expects.length} written\n  got: ${canon(got.map((m) => m.name))}`
    }
    for (let i = 0; i < expects.length; i++) {
      if (canon(got[i]) !== canon(expects[i])) {
        return `${arm}: message ${i} (${expects[i].name})\n  written: ${canon(expects[i])}\n  parsed:  ${canon(got[i])}`
      }
    }
  }
  return null
}

const variants = (plan) => {
  const out = []
  for (let i = 0; i < plan.messages.length; i++) {
    const messages = plan.messages.filter((_, k) => k !== i)
    const total = Buffer.concat(messages.map((m) => m.bytes)).length
    out.push({ messages, cuts: plan.cuts.filter((at) => at < total) })
  }
  for (let i = 0; i < plan.cuts.length; i++)
    out.push({ messages: plan.messages, cuts: plan.cuts.filter((_, k) => k !== i) })
  return out
}

const source = (plan) => {
  const lines = plan.messages.map((m) => `  ${canon(m.expect)}  // ${m.bytes.toString('hex')}`)
  return `messages:\n${lines.join('\n')}\ncut at bytes: ${plan.cuts.join(', ') || 'none'}`
}

main({ name: 'wire', draw, run, variants, source })

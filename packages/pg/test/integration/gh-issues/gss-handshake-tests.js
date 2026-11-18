'use strict'

const assert = require('assert')
const { execFile } = require('child_process')
const net = require('net')
const Module = require('module')
const { Client, Pool } = require('../../../lib')
const { Suite } = require('../../test-helper')

function authentication(code, data = Buffer.alloc(0)) {
  const packet = Buffer.alloc(data.length + 9)
  packet[0] = 0x52
  packet.writeInt32BE(data.length + 8, 1)
  packet.writeInt32BE(code, 5)
  data.copy(packet, 9)
  return packet
}

const ready = Buffer.from([0x5a, 0, 0, 0, 5, 0x49])
const challenge = Buffer.from([0, 128, 255])
const response = Buffer.from([255, 128, 0]).toString('base64')
const suite = new Suite()

async function fixture(reply, onToken) {
  const sockets = new Set()
  const tokens = []
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
    let startup = true
    let buffer = Buffer.alloc(0)
    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data])
      if (startup) {
        if (buffer.length < 4 || buffer.length < buffer.readInt32BE(0)) return
        buffer = buffer.subarray(buffer.readInt32BE(0))
        startup = false
        socket.write(reply)
      }
      while (buffer.length >= 5 && buffer.length >= buffer.readInt32BE(1) + 1) {
        const length = buffer.readInt32BE(1) + 1
        if (buffer[0] === 0x70) {
          tokens.push(Buffer.from(buffer.subarray(5, length)))
          if (onToken) onToken(socket)
        }
        if (buffer[0] === 0x58) socket.end()
        buffer = buffer.subarray(length)
      }
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    tokens,
    options: { host: '127.0.0.1', port: server.address().port, gssHost: 'db.example.test', ssl: false },
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy()
        server.close(resolve)
      }),
  }
}

async function withBinding(binding, action) {
  const original = Module._load
  Module._load = function (name, parent, isMain) {
    if (name === 'kerberos') {
      if (binding === undefined) {
        const error = new Error('fixture native binding unavailable')
        error.code = 'MODULE_NOT_FOUND'
        throw error
      }
      return binding
    }
    return original.call(this, name, parent, isMain)
  }
  try {
    await action()
  } finally {
    Module._load = original
  }
}

function binding(initializeClient) {
  return {
    GSS_C_MUTUAL_FLAG: 2,
    GSS_C_REPLAY_FLAG: 4,
    GSS_C_SEQUENCE_FLAG: 8,
    GSS_MECH_OID_KRB5: 9,
    GSS_MECH_OID_SPNEGO: 6,
    initializeClient,
  }
}

for (const [code, backpressure] of [
  [7, false],
  [9, false],
  [7, true],
]) {
  suite.test(`authentication ${code} waits for the final security step (backpressure: ${backpressure})`, async () => {
    const peer = await fixture(authentication(code), (socket) => {
      socket.write(Buffer.concat([authentication(8, challenge), authentication(0), ready]))
    })
    const context = {
      contextComplete: false,
      step: async (token) => {
        if (!token) return response
        assert.strictEqual(token, challenge.toString('base64'))
        await new Promise((resolve) => setTimeout(resolve, 10))
        context.contextComplete = true
        return null
      },
    }
    const library = binding(async (_service, options) => {
      assert.strictEqual(options.mechOID, code === 7 ? 9 : 6)
      return context
    })
    const client = new Client(peer.options)
    if (backpressure) {
      client.connection.once('connect', () => {
        const write = client.connection.stream.write.bind(client.connection.stream)
        client.connection.stream.write = (...args) => {
          write(...args)
          return false
        }
      })
    }
    try {
      await withBinding(library, async () => {
        await client.connect()
        assert.strictEqual(context.contextComplete, true)
        assert.strictEqual(client._gssVerified, true)
        assert.deepStrictEqual(peer.tokens, [Buffer.from(response, 'base64')])
      })
    } finally {
      await client.end()
      await peer.close()
    }
  })
}

suite.test('premature AuthenticationOk does not produce a successful connection', async () => {
  const peer = await fixture(Buffer.concat([authentication(7), authentication(0), ready]))
  const client = new Client(peer.options)
  try {
    await withBinding(
      binding(async () => ({ contextComplete: false, step: async () => response })),
      async () => {
        await assert.rejects(client.connect(), /before the client context completed/)
        assert.strictEqual(client._connected, false)
      }
    )
  } finally {
    await client.end()
    await peer.close()
  }
})

for (const order of ['gss-first', 'password-first']) {
  suite.test(`mixed authentication closes the connection without sending a password (${order})`, async () => {
    const reply =
      order === 'gss-first'
        ? Buffer.concat([authentication(7), authentication(3)])
        : Buffer.concat([authentication(3), authentication(7)])
    const peer = await fixture(Buffer.concat([reply, authentication(0), ready]))
    const client = new Client({ ...peer.options, password: async () => 'must-not-be-sent' })
    const errors = []
    client.on('error', (error) => errors.push(error))
    try {
      await withBinding(
        binding(async () => ({ contextComplete: false, step: async () => response })),
        async () => {
          await assert.rejects(client.connect(), /changed authentication|Unexpected GSS/)
          await new Promise((resolve) => setTimeout(resolve, 20))
          assert.deepStrictEqual(peer.tokens, [])
          assert.strictEqual(client._connected, false)
          assert.deepStrictEqual(errors, [])
        }
      )
    } finally {
      await client.end()
      await peer.close()
    }
  })
}

for (const api of ['client-promise', 'client-callback', 'pool']) {
  suite.test(`${api} rejects an unsolicited GSS continuation followed by server success`, async () => {
    const peer = await fixture(Buffer.concat([authentication(8, challenge), authentication(0), ready]))
    const target = api === 'pool' ? new Pool(peer.options) : new Client(peer.options)
    const errors = []
    target.on('error', (error) => errors.push(error))
    try {
      const connecting =
        api === 'client-callback'
          ? new Promise((resolve, reject) => target.connect((error) => (error ? reject(error) : resolve())))
          : target.connect()
      await assert.rejects(connecting, /GSS continuation received before authentication started/)
      await new Promise((resolve) => setTimeout(resolve, 20))
      assert.deepStrictEqual(errors, [])
      assert.deepStrictEqual(peer.tokens, [])
      if (api === 'pool') {
        assert.strictEqual(target.totalCount, 0)
        assert.strictEqual(target.idleCount, 0)
      } else {
        assert.strictEqual(target._connected, false)
      }
    } finally {
      await target.end()
      await peer.close()
    }
  })
}

for (const kind of ['callback', 'listener']) {
  suite.test(`does not classify a throwing connect ${kind} as a GSS authentication failure`, async () => {
    const peer = await fixture(authentication(7), (socket) => {
      socket.write(Buffer.concat([authentication(0), ready]))
    })
    const message = `application connect ${kind} failed`
    const script = `
      const { Client } = require(${JSON.stringify(require.resolve('../../../lib'))})
      const { GssSession } = require(${JSON.stringify(require.resolve('../../../lib/crypto/gss'))})
      GssSession.prototype.loadBinding = () => (${binding.toString()})(async () => ({
        contextComplete: true,
        step: async () => ${JSON.stringify(response)},
      }))
      const client = new Client(${JSON.stringify(peer.options)})
      client.on('error', () => process.exit(2))
      const fail = () => { throw new Error(${JSON.stringify(message)}) }
      if (${JSON.stringify(kind)} === 'callback') {
        client.connect((error) => {
          if (error) process.exit(3)
          fail()
        })
      } else {
        client.once('connect', fail)
        client.connect().catch(() => process.exit(3))
      }
    `
    try {
      const result = await new Promise((resolve) => {
        execFile(process.execPath, ['-e', script], { timeout: 3000 }, (error, stdout, stderr) => {
          resolve({ error, stderr })
        })
      })
      assert.strictEqual(result.error?.code, 1, result.stderr)
      assert.match(result.stderr, new RegExp(message))
    } finally {
      await peer.close()
    }
  })
}

for (const kind of ['end', 'timeout']) {
  suite.test(`${kind} settles connecting and suppresses a late native initialization result`, async () => {
    const peer = await fixture(authentication(7))
    let release
    let initialized
    const initialization = new Promise((resolve) => {
      initialized = resolve
    })
    const library = binding(() => {
      initialized()
      return new Promise((resolve) => {
        release = resolve
      })
    })
    const client = new Client({ ...peer.options, connectionTimeoutMillis: kind === 'timeout' ? 30 : 0 })
    try {
      await withBinding(library, async () => {
        const connecting = client.connect()
        const rejected = assert.rejects(connecting, kind === 'timeout' ? /timeout expired/ : /terminated during GSS/)
        await initialization
        if (kind === 'end') await client.end()
        await rejected
        release({ contextComplete: true, step: async () => response })
        await new Promise((resolve) => setTimeout(resolve, 20))
        assert.deepStrictEqual(peer.tokens, [])
        assert.strictEqual(client._connected, false)
      })
    } finally {
      await client.end()
      await peer.close()
    }
  })
}

suite.test('a missing optional binding rejects connect without an uncaught exception', async () => {
  const peer = await fixture(authentication(7))
  const client = new Client(peer.options)
  try {
    await withBinding(undefined, async () => {
      await assert.rejects(
        client.connect(),
        (error) => error.code === 'PG_GSS_AUTHENTICATION_FAILED' && /optional kerberos package/.test(error.message)
      )
    })
  } finally {
    await client.end()
    await peer.close()
  }
})

for (const source of ['profile', 'environment']) {
  suite.test(`required GSS encryption is rejected before opening a socket (${source})`, async () => {
    const peer = await fixture(authentication(7))
    const saved = process.env.PGGSSENCMODE
    if (source === 'environment') process.env.PGGSSENCMODE = 'require'
    const options = source === 'profile' ? { ...peer.options, gssencmode: 'require' } : peer.options
    const client = new Client(options)
    client.connection.connect = () => assert.fail('Required GSS encryption must not open a socket')
    let initialized = false
    try {
      await withBinding(
        binding(async () => {
          initialized = true
        }),
        async () => {
          await assert.rejects(client.connect(), (error) => error.code === 'PG_GSS_ENCRYPTION_UNSUPPORTED')
          assert.strictEqual(initialized, false)
          assert.deepStrictEqual(peer.tokens, [])
        }
      )
    } finally {
      if (saved === undefined) delete process.env.PGGSSENCMODE
      else process.env.PGGSSENCMODE = saved
      await client.end()
      await peer.close()
    }
  })
}

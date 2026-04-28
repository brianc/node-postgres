import assert from 'node:assert'
import { Buffer } from 'node:buffer'
import * as net from 'node:net'

import { describe, it } from 'vitest'

import Connection from '../../../src/connection.ts'
import { MemoryStream } from '../client/_test-helper.ts'

describe('connection errors', () => {
  it('connection emits stream errors', () =>
    new Promise<void>((resolve) => {
      const con = new Connection({ stream: new MemoryStream() as unknown as never })
      con.once('error', (err: Error) => {
        assert.equal(err.message, 'OMG!')
        resolve()
      })
      con.connect(0)
      con.stream.emit('error', new Error('OMG!'))
    }))

  it('connection emits ECONNRESET errors during normal operation', () =>
    new Promise<void>((resolve) => {
      const con = new Connection({ stream: new MemoryStream() as unknown as never })
      con.connect(0)
      con.once('error', (err: NodeJS.ErrnoException) => {
        assert.equal(err.code, 'ECONNRESET')
        resolve()
      })
      const e = new Error('Connection Reset') as NodeJS.ErrnoException
      e.code = 'ECONNRESET'
      con.stream.emit('error', e)
    }))

  it('connection does not emit ECONNRESET errors during disconnect', () => {
    const con = new Connection({ stream: new MemoryStream() as unknown as never })
    con.connect(0)
    const e = new Error('Connection Reset') as NodeJS.ErrnoException
    e.code = 'ECONNRESET'
    con.end()
    con.stream.emit('error', e)
    // pass — no error should propagate
  })

  const sslCases = [
    {
      testName: 'no error during disconnect with SSL',
      errorMessage: null as string | null,
      response: 'S',
      responseType: 'sslconnect',
    },
    {
      testName: 'emits an error when SSL is not supported',
      errorMessage: 'The server does not support SSL connections',
      response: 'N',
      responseType: 'error',
    },
    {
      testName: 'emits an error when postmaster responds to SSL negotiation packet',
      errorMessage: 'There was an error establishing an SSL connection',
      response: 'E',
      responseType: 'error',
    },
  ]

  for (const tc of sslCases) {
    it(
      tc.testName,
      () =>
        new Promise<void>((resolve) => {
          let socket: net.Socket | undefined
          const server = net.createServer((c) => {
            socket = c
            c.once('data', () => {
              c.write(Buffer.from(tc.response))
            })
          })

          server.listen(7778, () => {
            const con = new Connection({ ssl: true })
            con.connect(7778, 'localhost')
            con.once(tc.responseType, (err?: Error) => {
              if (tc.errorMessage !== null || err) {
                assert.equal(err && err.message, tc.errorMessage)
              }
              con.end()
              socket?.destroy()
              server.close()
              resolve()
            })
            con.requestSsl()
          })
        })
    )
  }
})

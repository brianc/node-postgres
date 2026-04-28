import assert from 'node:assert'

import { describe, it } from 'vitest'

import Connection from '../../../src/connection.ts'
import { MemoryStream } from '../client/_test-helper.ts'

describe('connection startup', () => {
  it('connection can take existing stream', () => {
    const stream = new MemoryStream()
    const con = new Connection({ stream: stream as unknown as never })
    assert.equal(con.stream, stream as unknown)
  })

  it('connection can take stream factory method', () => {
    const stream = new MemoryStream()
    const opts: { stream?: unknown } = {}
    const makeStream = (passed: unknown): MemoryStream => {
      assert.equal(passed, opts)
      return stream
    }
    opts.stream = makeStream
    const con = new Connection(opts as never)
    assert.equal(con.stream, stream as unknown)
  })

  describe('using any stream', () => {
    const makeStream = (): MemoryStream & { connectCalled?: boolean; port?: number; host?: string } => {
      const stream = new MemoryStream() as MemoryStream & { connectCalled?: boolean; port?: number; host?: string }
      ;(stream as unknown as { connect: (p: number, h: string) => void }).connect = function (
        this: typeof stream,
        port: number,
        host: string
      ) {
        this.connectCalled = true
        this.port = port
        this.host = host
      }
      return stream
    }

    it('makes stream connect, uses configured port/host, emits connected', () => {
      const stream = makeStream()
      const con = new Connection({ stream: stream as unknown as never })
      con.connect(1234, 'bang')
      assert.equal(stream.connectCalled, true)
      assert.equal(stream.port, 1234)
      assert.equal(stream.host, 'bang')

      let hit = false
      con.once('connect', () => {
        hit = true
      })

      assert.ok(stream.emit('connect'))
      assert.ok(hit)
    })

    it('after stream emits connected event init TCP-keepalive', () => {
      const stream = makeStream()
      const con = new Connection({ stream: stream as unknown as never, keepAlive: true })
      con.connect(123, 'test')

      let res = false
      ;(stream as unknown as { setKeepAlive: (v: boolean) => void }).setKeepAlive = (bit) => {
        res = bit
      }

      assert.ok(stream.emit('connect'))
      setTimeout(() => assert.equal(res, true))
    })
  })
})

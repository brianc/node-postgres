import { createRequire } from 'node:module'
import net from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Pool from '../src/index.ts'

const require = createRequire(import.meta.url)

describe('connection timeout', () => {
  const connectionFailure = new Error('Temporary connection failure')

  let server: net.Server
  let port: number

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        server = net.createServer((socket) => {
          socket.on('data', () => {
            // discard any buffered data or the server wont terminate
          })
        })

        server.listen(() => {
          port = (server.address() as net.AddressInfo).port
          resolve()
        })
      })
  )

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
  )

  it('should callback with an error if timeout is passed', () =>
    new Promise<void>((resolve) => {
      const pool = new Pool({ connectionTimeoutMillis: 10, port: port, host: 'localhost' })
      pool.connect((err, client) => {
        expect(err).toBeInstanceOf(Error)
        expect(err!.message).toContain('timeout')
        expect(client).toBe(undefined)
        expect(pool.idleCount).toBe(0)
        resolve()
      })
    }))

  it('should reject promise with an error if timeout is passed', () =>
    new Promise<void>((resolve) => {
      const pool = new Pool({ connectionTimeoutMillis: 10, port: port, host: 'localhost' })
      pool.connect().catch((err: Error) => {
        expect(err).toBeInstanceOf(Error)
        expect(err.message).toContain('timeout')
        expect(pool.idleCount).toBe(0)
        resolve()
      })
    }))

  it('should handle multiple timeouts', async () => {
    const errors: Error[] = []
    const pool = new Pool({ connectionTimeoutMillis: 1, port: port, host: 'localhost' })
    for (let i = 0; i < 15; i++) {
      try {
        await pool.connect()
      } catch (e) {
        errors.push(e as Error)
      }
    }
    expect(errors).toHaveLength(15)
  })

  it('should timeout on checkout of used connection', () =>
    new Promise<void>((resolve, reject) => {
      const pool = new Pool({ connectionTimeoutMillis: 100, max: 1 })
      pool.connect((err, client, release) => {
        expect(err).toBe(undefined)
        expect(client).not.toBe(undefined)
        pool.connect((err2, client2) => {
          expect(err2).toBeInstanceOf(Error)
          expect(client2).toBe(undefined)
          release()
          pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
        })
      })
    }))

  it('should not break further pending checkouts on a timeout', () =>
    new Promise<void>((resolve, reject) => {
      const pool = new Pool({ connectionTimeoutMillis: 200, max: 1 })
      pool.connect((err, _client, releaseOuter) => {
        expect(err).toBe(undefined)

        pool.connect((err2, client2) => {
          expect(err2).toBeInstanceOf(Error)
          expect(client2).toBe(undefined)
          releaseOuter()
        })

        setTimeout(() => {
          pool.connect((err3, client3, releaseInner) => {
            expect(err3).toBe(undefined)
            expect(client3).not.toBe(undefined)
            releaseInner()
            pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
          })
        }, 100)
      })
    }))

  it('should timeout on query if all clients are busy', () =>
    new Promise<void>((resolve, reject) => {
      const pool = new Pool({ connectionTimeoutMillis: 100, max: 1 })
      pool.connect((err, client, release) => {
        expect(err).toBe(undefined)
        expect(client).not.toBe(undefined)
        pool.query('select now()', (err2: Error | undefined, result: any) => {
          expect(err2).toBeInstanceOf(Error)
          expect(result).toBe(undefined)
          release()
          pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
        })
      })
    }))

  it('should recover from timeout errors', () =>
    new Promise<void>((resolve, reject) => {
      const pool = new Pool({ connectionTimeoutMillis: 100, max: 1 })
      pool.connect((err, client, release) => {
        expect(err).toBe(undefined)
        expect(client).not.toBe(undefined)
        pool.query('select now()', (err2: Error | undefined, result: any) => {
          expect(err2).toBeInstanceOf(Error)
          expect(result).toBe(undefined)
          release()
          pool.query('select $1::text as name', ['brianc'], (err3: Error | undefined, res: any) => {
            expect(err3).toBe(undefined)
            expect(res.rows).toHaveLength(1)
            pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
          })
        })
      })
    }))

  it('continues processing after a connection failure', () =>
    new Promise<void>((resolve, reject) => {
      const Client = require('pg').Client
      const orgConnect = Client.prototype.connect
      let called = false

      Client.prototype.connect = function (cb: (err: Error) => void) {
        // Simulate a failure on first call
        if (!called) {
          called = true

          return setTimeout(() => {
            cb(connectionFailure)
          }, 100)
        }
        // And pass-through the second call
        orgConnect.call(this, cb)
      }

      const pool = new Pool({
        Client: Client,
        connectionTimeoutMillis: 1000,
        max: 1,
      })

      pool.connect((err) => {
        expect(err).toBe(connectionFailure)

        pool.query('select $1::text as name', ['brianc'], (err2: Error | undefined, res: any) => {
          expect(err2).toBe(undefined)
          expect(res.rows).toHaveLength(1)
          Client.prototype.connect = orgConnect
          pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
        })
      })
    }))

  it('releases newly connected clients if the queued already timed out', () =>
    new Promise<void>((resolve, reject) => {
      const Client = require('pg').Client

      const orgConnect = Client.prototype.connect

      let connection = 0

      Client.prototype.connect = function (cb: (err?: Error) => void) {
        // Simulate a failure on first call
        if (connection === 0) {
          connection++

          return setTimeout(() => {
            cb(connectionFailure)
          }, 300)
        }

        // And second connect taking > connection timeout
        if (connection === 1) {
          connection++

          return setTimeout(() => {
            orgConnect.call(this, cb)
          }, 1000)
        }

        orgConnect.call(this, cb)
      }

      const pool = new Pool({
        Client: Client,
        connectionTimeoutMillis: 1000,
        max: 1,
      })

      // Direct connect
      pool.connect((err) => {
        expect(err).toBe(connectionFailure)
      })

      // Queued
      let called = 0
      pool.connect((err) => {
        // Verify the callback is only called once
        expect(called++).toBe(0)
        expect(err).toBeInstanceOf(Error)

        pool.query('select $1::text as name', ['brianc'], (err2: Error | undefined, res: any) => {
          expect(err2).toBe(undefined)
          expect(res.rows).toHaveLength(1)
          Client.prototype.connect = orgConnect
          pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
        })
      })
    }))

  it('should connect if timeout is passed, but native client in connected state', () =>
    new Promise<void>((resolve) => {
      const Client = require('pg').native.Client

      Client.prototype.connect = function (cb: () => void) {
        this._connected = true

        return setTimeout(() => {
          cb()
        }, 200)
      }

      const pool = new Pool({ connectionTimeoutMillis: 100, port: port, host: 'localhost' }, Client)

      pool.connect((err, client) => {
        expect(err).toBe(undefined)
        expect(client).not.toBe(undefined)
        expect((client as any).isConnected()).toBe(true)
        resolve()
      })
    }))
})

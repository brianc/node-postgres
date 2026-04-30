import net from 'node:net'
import { describe, expect, it } from 'vitest'
import Pool from '../src/index.ts'

describe('pool error handling', () => {
  it('Should complete these queries without dying', () =>
    new Promise<void>((resolve, reject) => {
      const pool = new Pool()
      let errors = 0
      let shouldGet = 0
      function runErrorQuery() {
        shouldGet++
        return new Promise<Error>((res, rej) => {
          pool
            .query("SELECT 'asd'+1 ")
            .then((r: any) => {
              rej(r) // this should always error
            })
            .catch((err: Error) => {
              errors++
              res(err)
            })
        })
      }
      const ps: Promise<Error>[] = []
      for (let i = 0; i < 5; i++) {
        ps.push(runErrorQuery())
      }
      Promise.all(ps).then(() => {
        expect(shouldGet).toEqual(errors)
        pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
      })
    }))

  it('Catches errors in client.query', async () => {
    let caught = false
    const pool = new Pool()
    try {
      await pool.query(null as any)
    } catch {
      caught = true
    }
    pool.end()
    expect(caught).toBe(true)
  })

  describe('calling release more than once', () => {
    it('should throw each time', async () => {
      const pool = new Pool()
      const client = await pool.connect()
      client.release()
      expect(() => client.release()).toThrow()
      expect(() => client.release()).toThrow()
      return pool.end()
    })

    it('should throw each time with callbacks', () =>
      new Promise<void>((resolve, reject) => {
        const pool = new Pool()

        pool.connect((err, _client, clientDone) => {
          expect(err).not.toBeInstanceOf(Error)
          clientDone()

          expect(() => clientDone()).toThrow()
          expect(() => clientDone()).toThrow()

          pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
        })
      }))
  })

  describe('using an ended pool', () => {
    it('rejects all additional promises', () =>
      new Promise<void>((resolve) => {
        const pool = new Pool()
        const promises: Promise<unknown>[] = []
        pool.end().then(() => {
          const squash = (promise: Promise<unknown>) => promise.catch(() => 'okay!')
          promises.push(squash(pool.connect()))
          promises.push(squash(pool.query('SELECT NOW()')))
          promises.push(squash(pool.end()))
          Promise.all(promises).then((res) => {
            expect(res).toEqual(['okay!', 'okay!', 'okay!'])
            resolve()
          })
        })
      }))

    it('returns an error on all additional callbacks', () =>
      new Promise<void>((resolve) => {
        const pool = new Pool()
        pool.end(() => {
          pool.query('SELECT *', (err: Error | undefined) => {
            expect(err).toBeInstanceOf(Error)
            pool.connect((err2) => {
              expect(err2).toBeInstanceOf(Error)
              pool.end((err3) => {
                expect(err3).toBeInstanceOf(Error)
                resolve()
              })
            })
          })
        })
      }))
  })

  describe('error from idle client', () => {
    it('removes client from pool', async () => {
      const pool = new Pool()
      const client = await pool.connect()
      expect(pool.totalCount).toBe(1)
      expect(pool.waitingCount).toBe(0)
      expect(pool.idleCount).toBe(0)
      client.release()
      await new Promise<void>((resolve, reject) => {
        process.nextTick(() => {
          let poolError: Error | undefined
          pool.once('error', (err: Error) => {
            poolError = err
          })

          let clientError: Error | undefined
          client.once('error', (err: Error) => {
            clientError = err
          })

          client.emit('error', new Error('expected'))

          expect(clientError!.message).toBe('expected')
          expect(poolError!.message).toBe('expected')
          expect(pool.idleCount).toBe(0)
          expect(pool.totalCount).toBe(0)
          pool.end().then(resolve, reject)
        })
      })
    })
  })

  describe('error from in-use client', () => {
    it('keeps the client in the pool', async () => {
      const pool = new Pool()
      const client = await pool.connect()
      expect(pool.totalCount).toBe(1)
      expect(pool.waitingCount).toBe(0)
      expect(pool.idleCount).toBe(0)

      await new Promise<void>((resolve, reject) => {
        process.nextTick(() => {
          let poolError: Error | undefined
          pool.once('error', (err: Error) => {
            poolError = err
          })

          let clientError: Error | undefined
          client.once('error', (err: Error) => {
            clientError = err
          })

          client.emit('error', new Error('expected'))

          expect(clientError!.message).toBe('expected')
          expect(poolError).toBeFalsy()
          expect(pool.idleCount).toBe(0)
          expect(pool.totalCount).toBe(1)
          client.release()
          pool.end().then(resolve, reject)
        })
      })
    })
  })

  describe('passing a function to pool.query', () => {
    it('calls back with error', () =>
      new Promise<void>((resolve, reject) => {
        const pool = new Pool()
        console.log('passing fn to query')
        pool.query(((err: Error | undefined) => {
          expect(err).toBeInstanceOf(Error)
          pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
        }) as any)
      }))
  })

  describe('pool with lots of errors', () => {
    it('continues to work and provide new clients', async () => {
      const pool = new Pool({ max: 1 })
      const errors: Error[] = []
      for (let i = 0; i < 20; i++) {
        try {
          await pool.query('invalid sql')
        } catch (err) {
          errors.push(err as Error)
        }
      }
      expect(errors).toHaveLength(20)
      expect(pool.idleCount).toBe(0)
      expect(typeof pool.query).toBe('function')
      const res: any = await pool.query('SELECT $1::text as name', ['brianc'])
      expect(res.rows).toHaveLength(1)
      expect(res.rows[0].name).toBe('brianc')
      return pool.end()
    })
  })

  it('should continue with queued items after a connection failure', () =>
    new Promise<void>((resolve, reject) => {
      const closeServer = net
        .createServer((socket) => {
          socket.destroy()
        })
        .unref()

      closeServer.listen(() => {
        const pool = new Pool({
          max: 1,
          port: (closeServer.address() as net.AddressInfo).port,
          host: 'localhost',
        })
        pool.connect((err: (Error & { code?: string }) | undefined) => {
          expect(err).toBeInstanceOf(Error)
          if (err!.code) {
            expect(err!.code).toBe('ECONNRESET')
          }
        })
        pool.connect((err: (Error & { code?: string }) | undefined) => {
          expect(err).toBeInstanceOf(Error)
          if (err!.code) {
            expect(err!.code).toBe('ECONNRESET')
          }
          closeServer.close(() => {
            pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
          })
        })
      })
    }))

  it('handles post-checkout client failures in pool.query', () =>
    new Promise<void>((resolve) => {
      const pool = new Pool({ max: 1 })
      pool.on('error', () => {
        // We double close the connection in this test, prevent exception caused by that
      })
      pool.query('SELECT pg_sleep(5)', [], (err: Error | undefined) => {
        expect(err).toBeInstanceOf(Error)
        resolve()
      })

      setTimeout(() => {
        pool._clients[0].end()
      }, 1000)
    }))
})

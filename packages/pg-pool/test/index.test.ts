import { describe, expect, it } from 'vitest'
import Pool from '../src/index.ts'

describe('pool', () => {
  describe('with callbacks', () => {
    it('works totally unconfigured', () =>
      new Promise<void>((resolve, reject) => {
        const pool = new Pool()
        pool.connect((err, client, release) => {
          if (err) return reject(err)
          client!.query('SELECT NOW()', (err, res) => {
            release()
            if (err) return reject(err)
            expect((res as { rows: unknown[] }).rows).toHaveLength(1)
            pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
          })
        })
      }))

    it('passes props to clients', () =>
      new Promise<void>((resolve, reject) => {
        const pool = new Pool({ binary: true } as any)
        pool.connect((err, client, release) => {
          release()
          if (err) return reject(err)
          expect((client as any).binary).toEqual(true)
          pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
        })
      }))

    it('can run a query with a callback without parameters', () =>
      new Promise<void>((resolve, reject) => {
        const pool = new Pool()
        pool.query('SELECT 1 as num', (err, res) => {
          expect(res.rows[0]).toEqual({ num: 1 })
          pool.end(() => {
            err ? reject(err) : resolve()
          })
        })
      }))

    it('can run a query with a callback', () =>
      new Promise<void>((resolve, reject) => {
        const pool = new Pool()
        pool.query('SELECT $1::text as name', ['brianc'], (err, res) => {
          expect(res.rows[0]).toEqual({ name: 'brianc' })
          pool.end(() => {
            err ? reject(err) : resolve()
          })
        })
      }))

    it('passes connection errors to callback', () =>
      new Promise<void>((resolve, reject) => {
        const pool = new Pool({ port: 53922 })
        pool.query('SELECT $1::text as name', ['brianc'], (err, res) => {
          expect(res).toBe(undefined)
          expect(err).toBeInstanceOf(Error)
          // a connection error should not pollute the pool with a dead client
          expect(pool.totalCount).toBe(0)
          pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
        })
      }))

    it('does not pass client to error callback', () =>
      new Promise<void>((resolve, reject) => {
        const pool = new Pool({ port: 58242 })
        pool.connect((err, client, release) => {
          expect(err).toBeInstanceOf(Error)
          expect(client).toBe(undefined)
          expect(typeof release).toBe('function')
          pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
        })
      }))

    it('removes client if it errors in background', () =>
      new Promise<void>((resolve, reject) => {
        const pool = new Pool()
        pool.connect((err, client, release) => {
          release()
          if (err) return reject(err)
          ;(client as any).testString = 'foo'
          setTimeout(() => {
            client!.emit('error', new Error('on purpose'))
          }, 10)
        })
        pool.on('error', (err: Error & { client?: any }) => {
          expect(err.message).toBe('on purpose')
          expect(err.client).not.toBe(undefined)
          expect(err.client.testString).toBe('foo')
          err.client.connection.stream.on('end', () => {
            pool.end((endErr: Error | undefined) => (endErr ? reject(endErr) : resolve()))
          })
        })
      }))

    it('should not change given options', () =>
      new Promise<void>((resolve, reject) => {
        const options = { max: 10 }
        const pool = new Pool(options)
        pool.connect((err, client, release) => {
          release()
          if (err) return reject(err)
          expect(options).toEqual({ max: 10 })
          pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
        })
      }))

    it('does not create promises when connecting', () =>
      new Promise<void>((resolve, reject) => {
        const pool = new Pool()
        const returnValue = pool.connect((err, client, release) => {
          release()
          if (err) return reject(err)
          pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
        })
        expect(returnValue).toBe(undefined)
      }))

    it('does not create promises when querying', () =>
      new Promise<void>((resolve, reject) => {
        const pool = new Pool()
        const returnValue = pool.query('SELECT 1 as num', (err: Error | undefined) => {
          pool.end(() => {
            err ? reject(err) : resolve()
          })
        })
        expect(returnValue).toBe(undefined)
      }))

    it('does not create promises when ending', () =>
      new Promise<void>((resolve, reject) => {
        const pool = new Pool()
        const returnValue = pool.end((err) => (err ? reject(err) : resolve()))
        expect(returnValue).toBe(undefined)
      }))

    it('never calls callback synchronously', () =>
      new Promise<void>((resolve, reject) => {
        const pool = new Pool()
        pool.connect((err, client) => {
          if (err) throw err
          client!.release()
          setImmediate(() => {
            let called = false
            pool.connect((err2, client2) => {
              if (err2) throw err2
              called = true
              client2!.release()
              setImmediate(() => {
                pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
              })
            })
            expect(called).toBe(false)
          })
        })
      }))
  })

  describe('with promises', () => {
    it('connects, queries, and disconnects', () => {
      const pool = new Pool()
      return pool.connect().then((client) => {
        return client.query('select $1::text as name', ['hi']).then((res: any) => {
          expect(res.rows).toEqual([{ name: 'hi' }])
          client.release()
          return pool.end()
        })
      })
    })

    it('executes a query directly', () => {
      const pool = new Pool()
      return pool.query('SELECT $1::text as name', ['hi']).then((res: any) => {
        expect(res.rows).toHaveLength(1)
        expect(res.rows[0].name).toBe('hi')
        return pool.end()
      })
    })

    it('properly pools clients', () => {
      const pool = new Pool({ poolSize: 9 })
      const promises = Array.from({ length: 30 }, () => {
        return pool.connect().then((client) => {
          return client.query('select $1::text as name', ['hi']).then((res: any) => {
            client.release()
            return res
          })
        })
      })
      return Promise.all(promises).then((res) => {
        expect(res).toHaveLength(30)
        expect(pool.totalCount).toBe(9)
        return pool.end()
      })
    })

    it('supports just running queries', () => {
      const pool = new Pool({ poolSize: 9 })
      const text = 'select $1::text as name'
      const values = ['hi']
      const query = { text: text, values: values }
      const promises = Array.from({ length: 30 }, () => pool.query(query))
      return Promise.all(promises).then((queries) => {
        expect(queries).toHaveLength(30)
        return pool.end()
      })
    })

    it('recovers from query errors', () => {
      const pool = new Pool()

      const errors: Error[] = []
      const promises = Array.from({ length: 30 }, () => {
        return pool.query('SELECT asldkfjasldkf').catch((e: Error) => {
          errors.push(e)
        })
      })
      return Promise.all(promises).then(() => {
        expect(errors).toHaveLength(30)
        expect(pool.totalCount).toBe(0)
        expect(pool.idleCount).toBe(0)
        return pool.query('SELECT $1::text as name', ['hi']).then((res: any) => {
          expect(res.rows).toEqual([{ name: 'hi' }])
          return pool.end()
        })
      })
    })
  })
})

import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import Pool from '../src/index.ts'

describe('events', () => {
  it('emits connect before callback', () =>
    new Promise<void>((resolve, reject) => {
      const pool = new Pool()
      let emittedClient: unknown = false
      pool.on('connect', (client) => {
        emittedClient = client
      })

      pool.connect((err, client, release) => {
        if (err) return reject(err)
        release()
        pool.end()
        expect(client).toBe(emittedClient)
        resolve()
      })
    }))

  it('emits "connect" only with a successful connection', () => {
    const pool = new Pool({
      // This client will always fail to connect
      Client: mockClient({
        connect(cb: (err: Error) => void) {
          process.nextTick(() => {
            cb(new Error('bad news'))
          })
        },
      }) as any,
    })
    pool.on('connect', () => {
      throw new Error('should never get here')
    })
    return pool.connect().catch((e: Error) => expect(e.message).toBe('bad news'))
  })

  it('emits acquire every time a client is acquired', () =>
    new Promise<void>((resolve, reject) => {
      const pool = new Pool()
      let acquireCount = 0
      pool.on('acquire', (client) => {
        expect(client).toBeTruthy()
        acquireCount++
      })
      for (let i = 0; i < 10; i++) {
        pool.connect((err, _client, release) => {
          if (err) return reject(err)
          release()
        })
        pool.query('SELECT now()')
      }
      setTimeout(() => {
        expect(acquireCount).toBe(20)
        pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
      }, 100)
    }))

  it('emits release every time a client is released', () =>
    new Promise<void>((resolve, reject) => {
      const pool = new Pool()
      let releaseCount = 0
      pool.on('release', (err: Error | undefined, client: unknown) => {
        expect(err instanceof Error).not.toBe(true)
        expect(client).toBeTruthy()
        releaseCount++
      })
      const promises: Promise<unknown>[] = []
      for (let i = 0; i < 10; i++) {
        pool.connect((err, _client, release) => {
          if (err) return reject(err)
          release()
        })
        promises.push(pool.query('SELECT now()'))
      }
      Promise.all(promises).then(() => {
        pool.end(() => {
          expect(releaseCount).toBe(20)
          resolve()
        })
      })
    }))

  it('emits release with an error if client is released due to an error', () =>
    new Promise<void>((resolve, reject) => {
      const pool = new Pool()
      pool.connect((err, client, release) => {
        expect(err).toBe(undefined)
        const releaseError = new Error('problem')
        pool.once('release', (err2: Error | undefined, errClient: unknown) => {
          expect(err2).toBe(releaseError)
          expect(errClient).toBe(client)
          pool.end((endErr) => (endErr ? reject(endErr) : resolve()))
        })
        release(releaseError)
      })
    }))

  it('emits error and client if an idle client in the pool hits an error', () =>
    new Promise<void>((resolve) => {
      const pool = new Pool()
      pool.connect((err, client) => {
        expect(err).toBe(undefined)
        client!.release()
        setImmediate(() => {
          client!.emit('error', new Error('problem'))
        })
        pool.once('error', (err2: Error, errClient: unknown) => {
          expect(err2.message).toBe('problem')
          expect(errClient).toBe(client)
          resolve()
        })
      })
    }))
})

function mockClient(methods: Record<string, unknown>): new () => EventEmitter {
  return function (this: EventEmitter) {
    const client = new EventEmitter()
    Object.assign(client, methods)
    return client
  } as unknown as new () => EventEmitter
}

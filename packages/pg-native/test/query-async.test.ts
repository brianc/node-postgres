import assert from 'node:assert'
import { afterAll, beforeAll, describe, it } from 'vitest'
import Client from '../src/index.ts'

describe('async query', () => {
  let client: Client

  beforeAll(
    () =>
      new Promise<void>((resolve, reject) => {
        client = new Client()
        client.connect((err) => (err ? reject(err) : resolve()))
      })
  )

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        client.end(() => resolve())
      })
  )

  it('can execute many prepared statements on a client', async () => {
    for (let i = 0; i < 20; i++) {
      await new Promise<void>((resolve, reject) => {
        client.query('SELECT $1::text as name', ['brianc'], (err) => (err ? reject(err) : resolve()))
      })
    }
  })

  it('simple query works', async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise<void>((resolve, reject) => {
        client.query('SELECT NOW() AS the_time', (err, rows) => {
          if (err) return reject(err)
          const r = rows as Array<Record<string, Date>>
          assert.equal(r[0]!.the_time!.getFullYear(), new Date().getFullYear())
          resolve()
        })
      })
    }
  })

  it('parameters work', async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise<void>((resolve, reject) => {
        client.query('SELECT $1::text AS name', ['Brian'], (err) => (err ? reject(err) : resolve()))
      })
    }
  })

  it('prepared, named statements work', () =>
    new Promise<void>((resolve, reject) => {
      client.prepare('test', 'SELECT $1::text as name', 1, (err) => {
        if (err) return reject(err)
        client.execute('test', ['Brian'], (err2, rows) => {
          if (err2) return reject(err2)
          const r = rows as Array<Record<string, string>>
          assert.equal(r.length, 1)
          assert.equal(r[0]!.name, 'Brian')
          client.execute('test', ['Aaron'], (err3, rows2) => {
            if (err3) return reject(err3)
            const r2 = rows2 as Array<Record<string, string>>
            assert.equal(r2.length, 1)
            assert.equal(r2[0]!.name, 'Aaron')
            resolve()
          })
        })
      })
    }))

  it('returns error if prepare fails', () =>
    new Promise<void>((resolve) => {
      client.prepare('test', 'SELECT AWWW YEAH', 0, (err) => {
        assert(err, 'Should have returned an error')
        resolve()
      })
    }))

  it('returns an error if execute fails', () =>
    new Promise<void>((resolve) => {
      client.execute('test', [], (err) => {
        assert(err, 'Should have returned an error')
        resolve()
      })
    }))

  it('returns an error if there was a query error', async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise<void>((resolve) => {
        client.query('SELECT ALKJSFDSLFKJ', (err) => {
          assert(err instanceof Error, 'Should return an error instance')
          resolve()
        })
      })
    }
  })

  it('is still usable after an error', () =>
    new Promise<void>((resolve, reject) => {
      let i = 0
      const next = (): void => {
        if (i >= 3) {
          client.query('SELECT NOW()', (err) => (err ? reject(err) : resolve()))
          return
        }
        i++
        client.query('SELECT LKJSDJFLSDKFJ', (err) => {
          assert(err instanceof Error, 'Should return an error instance')
          next()
        })
      }
      next()
    }))

  it('supports empty query', () =>
    new Promise<void>((resolve, reject) => {
      client.query('', (err, rows) => {
        if (err) return reject(err)
        assert(Array.isArray(rows))
        assert((rows as unknown[]).length === 0)
        resolve()
      })
    }))
})

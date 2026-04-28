import assert from 'node:assert'
import { Pool } from 'pg'
import { afterEach, beforeEach, describe, it } from 'vitest'
import Cursor from '../src/index.ts'

const text = 'SELECT generate_series as num FROM generate_series(0, 50)'

function poolQueryPromise(pool: Pool, readRowCount: number): Promise<void> {
  return new Promise((resolve, reject) => {
    pool.connect((err, client, done) => {
      if (err) {
        done!(err)
        return reject(err)
      }
      const cursor = client!.query(new Cursor(text))
      cursor.read(readRowCount, (err2?: Error | null) => {
        if (err2) {
          done!(err2)
          return reject(err2)
        }
        cursor.close((err3?: Error | null) => {
          if (err3) {
            done!(err3)
            return reject(err3)
          }
          done!()
          resolve()
        })
      })
    })
  })
}

describe('pool', () => {
  let pool: Pool

  beforeEach(() => {
    pool = new Pool({ max: 1 })
  })

  afterEach(() => {
    pool.end()
  })

  it('closes cursor early, single pool query', () =>
    new Promise<void>((resolve, reject) => {
      poolQueryPromise(pool, 25)
        .then(() => resolve())
        .catch((err) => {
          assert.ifError(err)
          reject(err)
        })
    }))

  it('closes cursor early, saturated pool', () =>
    new Promise<void>((resolve, reject) => {
      const promises: Promise<void>[] = []
      for (let i = 0; i < 10; i++) {
        promises.push(poolQueryPromise(pool, 25))
      }
      Promise.all(promises)
        .then(() => resolve())
        .catch((err) => {
          assert.ifError(err)
          reject(err)
        })
    }))

  it('closes exhausted cursor, single pool query', () =>
    new Promise<void>((resolve, reject) => {
      poolQueryPromise(pool, 100)
        .then(() => resolve())
        .catch((err) => {
          assert.ifError(err)
          reject(err)
        })
    }))

  it('closes exhausted cursor, saturated pool', () =>
    new Promise<void>((resolve, reject) => {
      const promises: Promise<void>[] = []
      for (let i = 0; i < 10; i++) {
        promises.push(poolQueryPromise(pool, 100))
      }
      Promise.all(promises)
        .then(() => resolve())
        .catch((err) => {
          assert.ifError(err)
          reject(err)
        })
    }))

  it('can close multiple times on a pool', async () => {
    const localPool = new Pool({ max: 1 })
    const run = async () => {
      const cursor = new Cursor(text)
      const client = await localPool.connect()
      client.query(cursor)
      await new Promise<void>((resolve) => {
        cursor.read(25, (err?: Error | null) => {
          assert.ifError(err)
          cursor.close((err2?: Error | null) => {
            assert.ifError(err2)
            client.release()
            resolve()
          })
        })
      })
    }
    await Promise.all([run(), run(), run()])
    await localPool.end()
  })
})

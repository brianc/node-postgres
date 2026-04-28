import assert from 'node:assert'
import concat from 'concat-stream'
import { it } from 'vitest'
import QueryStream from '../src/index.ts'
import helper from './_helper.ts'

helper('close', (client) => {
  it('emits close', () =>
    new Promise<void>((resolve) => {
      const stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [3], {
        batchSize: 2,
        highWaterMark: 2,
      })
      const query = client.query(stream)
      query.pipe(concat(() => {}))
      query.on('close', () => resolve())
    }))
})

helper('early close', (client) => {
  it('can be closed early', () =>
    new Promise<void>((resolve) => {
      const stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [20000], {
        batchSize: 2,
        highWaterMark: 2,
      })
      const query = client.query(stream)
      let readCount = 0
      query.on('readable', () => {
        readCount++
        query.read()
      })
      query.once('readable', () => {
        query.destroy()
      })
      query.on('close', () => {
        assert(readCount < 10, 'should not have read more than 10 rows')
        resolve()
      })
    }))

  it('can destroy stream while reading', () =>
    new Promise<void>((resolve, reject) => {
      const stream = new QueryStream('SELECT * FROM generate_series(0, 100), pg_sleep(1)')
      client.query(stream)
      stream.on('data', () => reject(new Error('stream should not have returned rows')))
      setTimeout(() => {
        stream.destroy()
        stream.on('close', () => resolve())
      }, 100)
    }))

  it('emits an error when calling destroy with an error', () =>
    new Promise<void>((resolve, reject) => {
      const stream = new QueryStream('SELECT * FROM generate_series(0, 100), pg_sleep(1)')
      client.query(stream)
      stream.on('data', () => reject(new Error('stream should not have returned rows')))
      setTimeout(() => {
        stream.destroy(new Error('intentional error'))
        stream.on('error', (err: Error) => {
          // make sure there's an error
          assert(err)
          assert.strictEqual(err.message, 'intentional error')
          resolve()
        })
      }, 100)
    }))

  it('can destroy stream while reading an error', () =>
    new Promise<void>((resolve, reject) => {
      const stream = new QueryStream('SELECT * from  pg_sleep(1), basdfasdf;')
      client.query(stream)
      stream.on('data', () => reject(new Error('stream should not have returned rows')))
      stream.once('error', () => {
        stream.destroy()
        // wait a bit to let any other errors shake through
        setTimeout(() => resolve(), 100)
      })
    }))

  it('does not crash when destroying the stream immediately after calling read', () =>
    new Promise<void>((resolve, reject) => {
      const stream = new QueryStream('SELECT * from generate_series(0, 100), pg_sleep(1);')
      client.query(stream)
      stream.on('data', () => reject(new Error('stream should not have returned rows')))
      stream.destroy()
      stream.on('close', () => resolve())
    }))

  it('does not crash when destroying the stream before its submitted', () =>
    new Promise<void>((resolve, reject) => {
      const stream = new QueryStream('SELECT * from generate_series(0, 100), pg_sleep(1);')
      stream.on('data', () => reject(new Error('stream should not have returned rows')))
      stream.destroy()
      stream.on('close', () => resolve())
    }))
})

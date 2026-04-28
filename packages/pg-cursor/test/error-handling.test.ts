import assert from 'node:assert'
import { Client } from 'pg'
import { describe, it } from 'vitest'
import Cursor from '../src/index.ts'

const text = 'SELECT generate_series as num FROM generate_series(0, 4)'

describe('error handling', () => {
  it('can continue after error', () =>
    new Promise<void>((resolve, reject) => {
      const client = new Client()
      client.connect()
      const cursor = client.query(new Cursor('asdfdffsdf'))
      cursor.read(1, (err: Error | null) => {
        assert(err)
        client.query('SELECT NOW()', (err2: Error | null) => {
          if (err2) return reject(err2)
          assert.ifError(err2)
          client.end()
          resolve()
        })
      })
    }))

  it('errors queued reads', async () => {
    const client = new Client()
    await client.connect()

    const cursor = client.query(new Cursor('asdfdffsdf'))

    const immediateRead = cursor.read(1)
    const queuedRead1 = cursor.read(1)
    const queuedRead2 = cursor.read(1)

    assert(
      await immediateRead.then(
        () => null,
        (err: Error) => err
      )
    )
    assert(
      await queuedRead1.then(
        () => null,
        (err: Error) => err
      )
    )
    assert(
      await queuedRead2.then(
        () => null,
        (err: Error) => err
      )
    )

    client.end()
  })
})

describe('read callback does not fire sync', () => {
  it('does not fire error callback sync', () =>
    new Promise<void>((resolve) => {
      const client = new Client()
      client.connect()
      const cursor = client.query(new Cursor('asdfdffsdf'))
      let after = false
      cursor.read(1, (err: Error | null) => {
        assert(err, 'error should be returned')
        assert.strictEqual(after, true, 'should not call read sync')
        after = false
        cursor.read(1, (err2: Error | null) => {
          assert(err2, 'error should be returned')
          assert.strictEqual(after, true, 'should not call read sync')
          client.end()
          resolve()
        })
        after = true
      })
      after = true
    }))

  it('does not fire result sync after finished', () =>
    new Promise<void>((resolve) => {
      const client = new Client()
      client.connect()
      const cursor = client.query(new Cursor('SELECT NOW()'))
      let after = false
      cursor.read(1, (err: Error | null) => {
        assert(!err)
        assert.strictEqual(after, true, 'should not call read sync')
        cursor.read(1, (err2: Error | null) => {
          assert(!err2)
          after = false
          cursor.read(1, (err3: Error | null) => {
            assert(!err3)
            assert.strictEqual(after, true, 'should not call read sync')
            client.end()
            resolve()
          })
          after = true
        })
      })
      after = true
    }))
})

describe('proper cleanup', () => {
  it('can issue multiple cursors on one client', () =>
    new Promise<void>((resolve) => {
      const client = new Client()
      client.connect()
      const cursor1 = client.query(new Cursor(text))
      cursor1.read(8, (err: Error | null, rows: unknown[]) => {
        assert.ifError(err)
        assert.strictEqual(rows.length, 5)
        const cursor2 = client.query(new Cursor(text))
        cursor2.read(8, (err2: Error | null, rows2: unknown[]) => {
          assert.ifError(err2)
          assert.strictEqual(rows2.length, 5)
          client.end()
          resolve()
        })
      })
    }))
})

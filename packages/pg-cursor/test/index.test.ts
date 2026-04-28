import assert from 'node:assert'
import { Client } from 'pg'
import { afterEach, beforeEach, describe, it } from 'vitest'
import Cursor from '../src/index.ts'

const text = 'SELECT generate_series as num FROM generate_series(0, 5)'

describe('cursor', () => {
  let client: Client
  let pgCursor: (text: string, values?: unknown[]) => InstanceType<typeof Cursor>

  beforeEach(async () => {
    client = new Client()
    await client.connect()
    pgCursor = (text: string, values?: unknown[]) => client.query(new Cursor(text, values || []))
  })

  afterEach(() => {
    client.end()
  })

  it('fetch 6 when asking for 10', () =>
    new Promise<void>((resolve) => {
      const cursor = pgCursor(text)
      cursor.read(10, (err, res) => {
        assert.ifError(err)
        assert.strictEqual(res!.length, 6)
        resolve()
      })
    }))

  it('end before reading to end', () =>
    new Promise<void>((resolve) => {
      const cursor = pgCursor(text)
      cursor.read(3, (err, res) => {
        assert.ifError(err)
        assert.strictEqual(res!.length, 3)
        resolve()
      })
    }))

  it('callback with error', () =>
    new Promise<void>((resolve) => {
      const cursor = pgCursor('select asdfasdf')
      cursor.read(1, (err) => {
        assert(err)
        resolve()
      })
    }))

  it('read a partial chunk of data', () =>
    new Promise<void>((resolve) => {
      const cursor = pgCursor(text)
      cursor.read(2, (err, res) => {
        assert.ifError(err)
        assert.strictEqual(res!.length, 2)
        cursor.read(3, (err2, res2) => {
          assert(!err2)
          assert.strictEqual(res2!.length, 3)
          cursor.read(1, (err3, res3) => {
            assert(!err3)
            assert.strictEqual(res3!.length, 1)
            cursor.read(1, (err4, res4) => {
              assert(!err4)
              assert.ifError(err4)
              assert.strictEqual(res4!.length, 0)
              resolve()
            })
          })
        })
      })
    }))

  it('read return length 0 past the end', () =>
    new Promise<void>((resolve) => {
      const cursor = pgCursor(text)
      cursor.read(2, (err) => {
        assert(!err)
        cursor.read(100, (err2, res) => {
          assert(!err2)
          assert.strictEqual(res!.length, 4)
          cursor.read(100, (err3, res2) => {
            assert(!err3)
            assert.strictEqual(res2!.length, 0)
            resolve()
          })
        })
      })
    }))

  it('read huge result', () =>
    new Promise<void>((resolve, reject) => {
      const text2 = 'SELECT generate_series as num FROM generate_series(0, 100000)'
      const values: unknown[] = []
      const cursor = pgCursor(text2, values)
      let count = 0
      const read = () => {
        cursor.read(100, (err, rows) => {
          if (err) return reject(err)
          if (!rows!.length) {
            assert.strictEqual(count, 100001)
            return resolve()
          }
          count += rows!.length
          setImmediate(read)
        })
      }
      read()
    }))

  it('normalizes parameter values', () =>
    new Promise<void>((resolve, reject) => {
      const text2 = 'SELECT $1::json me'
      const values = [{ name: 'brian' }]
      const cursor = pgCursor(text2, values)
      cursor.read(1, (err, rows) => {
        if (err) return reject(err)
        assert.strictEqual((rows![0] as { me: { name: string } }).me.name, 'brian')
        cursor.read(1, (err2, rows2) => {
          assert(!err2)
          assert.strictEqual(rows2!.length, 0)
          resolve()
        })
      })
    }))

  it('returns result along with rows', () =>
    new Promise<void>((resolve) => {
      const cursor = pgCursor(text)
      cursor.read(1, (err, rows, result) => {
        assert.ifError(err)
        assert.strictEqual(rows!.length, 1)
        assert.strictEqual(rows, (result as { rows: unknown[] }).rows)
        assert.deepStrictEqual(
          (result as { fields: { name: string }[] }).fields.map((f) => f.name),
          ['num']
        )
        resolve()
      })
    }))

  it('emits row events', () =>
    new Promise<void>((resolve) => {
      const cursor = pgCursor(text)
      cursor.read(10)
      cursor.on('row', (row, result) => result.addRow(row))
      cursor.on('end', (result) => {
        assert.strictEqual(result.rows.length, 6)
        resolve()
      })
    }))

  it('emits row events when cursor is closed manually', () =>
    new Promise<void>((resolve) => {
      const cursor = pgCursor(text)
      cursor.on('row', (row, result) => result.addRow(row))
      cursor.on('end', (result) => {
        assert.strictEqual(result.rows.length, 3)
        resolve()
      })

      cursor.read(3, () => cursor.close())
    }))

  it('emits error events', () =>
    new Promise<void>((resolve) => {
      const cursor = pgCursor('select asdfasdf')
      cursor.on('error', (err) => {
        assert(err)
        resolve()
      })
    }))

  it('returns rowCount on insert', () =>
    new Promise<void>((resolve, reject) => {
      client
        .query('CREATE TEMPORARY TABLE pg_cursor_test (foo VARCHAR(1), bar VARCHAR(1))')
        .then(() => {
          const cursor = pgCursor('insert into pg_cursor_test values($1, $2)', ['a', 'b'])
          cursor.read(1, (err, rows, result) => {
            assert.ifError(err)
            assert.strictEqual(rows!.length, 0)
            assert.strictEqual((result as { rowCount: number }).rowCount, 1)
            resolve()
          })
        })
        .catch(reject)
    }))
})

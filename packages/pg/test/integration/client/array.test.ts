import { afterAll, beforeAll, describe, it } from 'vitest'
import assert from 'node:assert'
import helper from './_test-helper.ts'

describe('array', () => {
  const pg = helper.pg
  const pool = new pg.Pool()
  let client: Parameters<Parameters<typeof pool.connect>[0]>[1]
  let release: () => void

  beforeAll(
    () =>
      new Promise<void>((resolve, reject) => {
        pool.connect((err, c, done) => {
          if (err) return reject(err)
          if (!c) return reject(new Error('no client'))
          client = c
          release = done
          client.query('CREATE TEMP TABLE why(names text[], numbors integer[])', (e) => {
            if (e) return reject(e)
            client.query(
              'INSERT INTO why(names, numbors) VALUES(\'{"aaron", "brian","a b c" }\', \'{1, 2, 3}\')',
              (e2) => {
                if (e2) return reject(e2)
                resolve()
              }
            )
          })
        })
      })
  )

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        release()
        pool.end(() => resolve())
      })
  )

  it('nulls', () =>
    new Promise<void>((done, reject) => {
      client.query('SELECT $1::text[] as array', [[null]], (err, result) => {
        try {
          assert(!err)
          const array = result.rows[0].array
          assert.lengthIs(array, 1)
          assert.isNull(array[0])
          done()
        } catch (e) {
          reject(e)
        }
      })
    }))

  it('elements containing JSON-escaped characters', () =>
    new Promise<void>((done, reject) => {
      let param = '\\"\\"'
      for (let i = 1; i <= 0x1f; i++) {
        param += String.fromCharCode(i)
      }

      client.query('SELECT $1::text[] as array', [[param]], (err, result) => {
        try {
          assert(!err)
          const array = result.rows[0].array
          assert.lengthIs(array, 1)
          assert.equal(array[0], param)
          done()
        } catch (e) {
          reject(e)
        }
      })
    }))

  it('numbers', () =>
    new Promise<void>((done, reject) => {
      client.query('SELECT numbors FROM why', (err, result) => {
        try {
          assert(!err)
          assert.lengthIs(result.rows[0].numbors, 3)
          assert.equal(result.rows[0].numbors[0], 1)
          assert.equal(result.rows[0].numbors[1], 2)
          assert.equal(result.rows[0].numbors[2], 3)
          done()
        } catch (e) {
          reject(e)
        }
      })
    }))

  it('parses string arrays', () =>
    new Promise<void>((done, reject) => {
      client.query('SELECT names FROM why', (err, result) => {
        try {
          assert(!err)
          const names = result.rows[0].names
          assert.lengthIs(names, 3)
          assert.equal(names[0], 'aaron')
          assert.equal(names[1], 'brian')
          assert.equal(names[2], 'a b c')
          done()
        } catch (e) {
          reject(e)
        }
      })
    }))

  it('empty array', () =>
    new Promise<void>((done, reject) => {
      client.query("SELECT '{}'::text[] as names", (err, result) => {
        try {
          assert(!err)
          assert.lengthIs(result.rows[0].names, 0)
          done()
        } catch (e) {
          reject(e)
        }
      })
    }))

  it('element containing comma', () =>
    new Promise<void>((done, reject) => {
      client.query('SELECT \'{"joe,bob",jim}\'::text[] as names', (err, result) => {
        try {
          assert(!err)
          const names = result.rows[0].names
          assert.lengthIs(names, 2)
          assert.equal(names[0], 'joe,bob')
          assert.equal(names[1], 'jim')
          done()
        } catch (e) {
          reject(e)
        }
      })
    }))

  it('bracket in quotes', () =>
    new Promise<void>((done, reject) => {
      client.query('SELECT \'{"{","}"}\'::text[] as names', (err, result) => {
        try {
          assert(!err)
          const names = result.rows[0].names
          assert.lengthIs(names, 2)
          assert.equal(names[0], '{')
          assert.equal(names[1], '}')
          done()
        } catch (e) {
          reject(e)
        }
      })
    }))

  it('null value', () =>
    new Promise<void>((done, reject) => {
      client.query('SELECT \'{joe,null,bob,"NULL"}\'::text[] as names', (err, result) => {
        try {
          assert(!err)
          const names = result.rows[0].names
          assert.lengthIs(names, 4)
          assert.equal(names[0], 'joe')
          assert.equal(names[1], null)
          assert.equal(names[2], 'bob')
          assert.equal(names[3], 'NULL')
          done()
        } catch (e) {
          reject(e)
        }
      })
    }))

  it('element containing quote char', () =>
    new Promise<void>((done, reject) => {
      client.query("SELECT ARRAY['joe''', 'jim', 'bob\"'] AS names", (err, result) => {
        try {
          assert(!err)
          const names = result.rows[0].names
          assert.lengthIs(names, 3)
          assert.equal(names[0], "joe'")
          assert.equal(names[1], 'jim')
          assert.equal(names[2], 'bob"')
          done()
        } catch (e) {
          reject(e)
        }
      })
    }))

  it('nested array', () =>
    new Promise<void>((done, reject) => {
      client.query("SELECT '{{1,joe},{2,bob}}'::text[] as names", (err, result) => {
        try {
          assert(!err)
          const names = result.rows[0].names
          assert.lengthIs(names, 2)
          assert.lengthIs(names[0], 2)
          assert.equal(names[0][0], '1')
          assert.equal(names[0][1], 'joe')
          assert.lengthIs(names[1], 2)
          assert.equal(names[1][0], '2')
          assert.equal(names[1][1], 'bob')
          done()
        } catch (e) {
          reject(e)
        }
      })
    }))

  it('integer array', () =>
    new Promise<void>((done, reject) => {
      client.query("SELECT '{1,2,3}'::integer[] as names", (err, result) => {
        try {
          assert(!err)
          const names = result.rows[0].names
          assert.lengthIs(names, 3)
          assert.equal(names[0], 1)
          assert.equal(names[1], 2)
          assert.equal(names[2], 3)
          done()
        } catch (e) {
          reject(e)
        }
      })
    }))

  it('integer nested array', () =>
    new Promise<void>((done, reject) => {
      client.query("SELECT '{{1,100},{2,100},{3,100}}'::integer[] as names", (err, result) => {
        try {
          assert(!err)
          const names = result.rows[0].names
          assert.lengthIs(names, 3)
          assert.equal(names[0][0], 1)
          assert.equal(names[0][1], 100)
          assert.equal(names[1][0], 2)
          assert.equal(names[1][1], 100)
          assert.equal(names[2][0], 3)
          assert.equal(names[2][1], 100)
          done()
        } catch (e) {
          reject(e)
        }
      })
    }))

  it('JS array parameter', () =>
    new Promise<void>((done, reject) => {
      client.query(
        'SELECT $1::integer[] as names',
        [
          [
            [1, 100],
            [2, 100],
            [3, 100],
          ],
        ],
        (err, result) => {
          try {
            assert(!err)
            const names = result.rows[0].names
            assert.lengthIs(names, 3)
            assert.equal(names[0][0], 1)
            assert.equal(names[0][1], 100)
            assert.equal(names[1][0], 2)
            assert.equal(names[1][1], 100)
            assert.equal(names[2][0], 3)
            assert.equal(names[2][1], 100)
            done()
          } catch (e) {
            reject(e)
          }
        }
      )
    }))
})

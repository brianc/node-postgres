import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'

describe('array', () => {
  const pg = helper.pg
  const pool = new pg.Pool()

  pool.connect(
    assert.calls(function (err, client, release) {
      assert(!err)

      it('nulls', () =>
        new Promise<void>((done) => {
          client.query(
            'SELECT $1::text[] as array',
            [[null]],
            assert.success(function (result) {
              const array = result.rows[0].array
              assert.lengthIs(array, 1)
              assert.isNull(array[0])
              done()
            })
          )
        }))

      it('elements containing JSON-escaped characters', () =>
        new Promise<void>((done) => {
          let param = '\\"\\"'

          for (let i = 1; i <= 0x1f; i++) {
            param += String.fromCharCode(i)
          }

          client.query(
            'SELECT $1::text[] as array',
            [[param]],
            assert.success(function (result) {
              const array = result.rows[0].array
              assert.lengthIs(array, 1)
              assert.equal(array[0], param)
              done()
            })
          )
        }))

      it('cleanup', () => release())

      pool.connect(
        assert.calls(function (err, client, release) {
          assert(!err)
          client.query('CREATE TEMP TABLE why(names text[], numbors integer[])')
          client
            .query(
              new pg.Query('INSERT INTO why(names, numbors) VALUES(\'{"aaron", "brian","a b c" }\', \'{1, 2, 3}\')')
            )
            .on('error', console.log)
          it('numbers', () =>
            new Promise<void>((done) => {
              //      client.connection.on('message', console.log)
              client.query(
                'SELECT numbors FROM why',
                assert.success(function (result) {
                  assert.lengthIs(result.rows[0].numbors, 3)
                  assert.equal(result.rows[0].numbors[0], 1)
                  assert.equal(result.rows[0].numbors[1], 2)
                  assert.equal(result.rows[0].numbors[2], 3)
                  done()
                })
              )
            }))

          it('parses string arrays', () =>
            new Promise<void>((done) => {
              client.query(
                'SELECT names FROM why',
                assert.success(function (result) {
                  const names = result.rows[0].names
                  assert.lengthIs(names, 3)
                  assert.equal(names[0], 'aaron')
                  assert.equal(names[1], 'brian')
                  assert.equal(names[2], 'a b c')
                  done()
                })
              )
            }))

          it('empty array', () =>
            new Promise<void>((done) => {
              client.query(
                "SELECT '{}'::text[] as names",
                assert.success(function (result) {
                  const names = result.rows[0].names
                  assert.lengthIs(names, 0)
                  done()
                })
              )
            }))

          it('element containing comma', () =>
            new Promise<void>((done) => {
              client.query(
                'SELECT \'{"joe,bob",jim}\'::text[] as names',
                assert.success(function (result) {
                  const names = result.rows[0].names
                  assert.lengthIs(names, 2)
                  assert.equal(names[0], 'joe,bob')
                  assert.equal(names[1], 'jim')
                  done()
                })
              )
            }))

          it('bracket in quotes', () =>
            new Promise<void>((done) => {
              client.query(
                'SELECT \'{"{","}"}\'::text[] as names',
                assert.success(function (result) {
                  const names = result.rows[0].names
                  assert.lengthIs(names, 2)
                  assert.equal(names[0], '{')
                  assert.equal(names[1], '}')
                  done()
                })
              )
            }))

          it('null value', () =>
            new Promise<void>((done) => {
              client.query(
                'SELECT \'{joe,null,bob,"NULL"}\'::text[] as names',
                assert.success(function (result) {
                  const names = result.rows[0].names
                  assert.lengthIs(names, 4)
                  assert.equal(names[0], 'joe')
                  assert.equal(names[1], null)
                  assert.equal(names[2], 'bob')
                  assert.equal(names[3], 'NULL')
                  done()
                })
              )
            }))

          it('element containing quote char', () =>
            new Promise<void>((done) => {
              client.query(
                "SELECT ARRAY['joe''', 'jim', 'bob\"'] AS names",
                assert.success(function (result) {
                  const names = result.rows[0].names
                  assert.lengthIs(names, 3)
                  assert.equal(names[0], "joe'")
                  assert.equal(names[1], 'jim')
                  assert.equal(names[2], 'bob"')
                  done()
                })
              )
            }))

          it('nested array', () =>
            new Promise<void>((done) => {
              client.query(
                "SELECT '{{1,joe},{2,bob}}'::text[] as names",
                assert.success(function (result) {
                  const names = result.rows[0].names
                  assert.lengthIs(names, 2)

                  assert.lengthIs(names[0], 2)
                  assert.equal(names[0][0], '1')
                  assert.equal(names[0][1], 'joe')

                  assert.lengthIs(names[1], 2)
                  assert.equal(names[1][0], '2')
                  assert.equal(names[1][1], 'bob')
                  done()
                })
              )
            }))

          it('integer array', () =>
            new Promise<void>((done) => {
              client.query(
                "SELECT '{1,2,3}'::integer[] as names",
                assert.success(function (result) {
                  const names = result.rows[0].names
                  assert.lengthIs(names, 3)
                  assert.equal(names[0], 1)
                  assert.equal(names[1], 2)
                  assert.equal(names[2], 3)
                  done()
                })
              )
            }))

          it('integer nested array', () =>
            new Promise<void>((done) => {
              client.query(
                "SELECT '{{1,100},{2,100},{3,100}}'::integer[] as names",
                assert.success(function (result) {
                  const names = result.rows[0].names
                  assert.lengthIs(names, 3)
                  assert.equal(names[0][0], 1)
                  assert.equal(names[0][1], 100)

                  assert.equal(names[1][0], 2)
                  assert.equal(names[1][1], 100)

                  assert.equal(names[2][0], 3)
                  assert.equal(names[2][1], 100)
                  done()
                })
              )
            }))

          it('JS array parameter', () =>
            new Promise<void>((done) => {
              client.query(
                'SELECT $1::integer[] as names',
                [
                  [
                    [1, 100],
                    [2, 100],
                    [3, 100],
                  ],
                ],
                assert.success(function (result) {
                  const names = result.rows[0].names
                  assert.lengthIs(names, 3)
                  assert.equal(names[0][0], 1)
                  assert.equal(names[0][1], 100)

                  assert.equal(names[1][0], 2)
                  assert.equal(names[1][1], 100)

                  assert.equal(names[2][0], 3)
                  assert.equal(names[2][1], 100)
                  release()
                  pool.end(() => {
                    done()
                  })
                })
              )
            }))
        })
      )
    })
  )
})

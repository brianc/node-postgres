'use strict'
const assert = require('assert')
const Cursor = require('../')
const pg = require('pg')

describe('type parser errors', () => {
  let client

  beforeEach(async () => {
    client = new pg.Client()
    await client.connect()
  })

  afterEach(async () => {
    await client.end()
  })

  it('preserves the parser error if a later row causes a server error', async () => {
    const parserError = new Error('cannot decode value')
    const types = {
      getTypeParser: () => (value) => {
        if (value === '3') throw parserError
        return Number(value)
      },
    }
    const text = 'SELECT value, 10 / (5 - value) AS quotient FROM generate_series(1, 6) value'
    await assert.rejects(client.query({ text, types }), (error) => error === parserError)

    const cursor = client.query(new Cursor(text, [], { types }))
    await assert.rejects(cursor.read(20), (error) => error === parserError)
    const result = await client.query('SELECT 42 AS answer')
    assert.deepStrictEqual(result.rows, [{ answer: 42 }])
  })

  for (const rowMode of [undefined, 'array']) {
    for (const batchSize of [2, 20]) {
      it(`reports a parser error once with rowMode=${rowMode} and batchSize=${batchSize}`, async () => {
        const parserError = new Error('cannot decode value')
        const parsedValues = []
        const types = {
          getTypeParser: () => (value) => {
            parsedValues.push(value)
            if (value === '3') throw parserError
            return Number(value)
          },
        }
        const cursor = client.query(new Cursor('SELECT value FROM generate_series(1, 6) value', [], { types, rowMode }))
        const emittedErrors = []
        let endCount = 0
        cursor.on('error', (error) => emittedErrors.push(error))
        cursor.on('end', () => endCount++)

        assert.deepStrictEqual(await cursor.read(1), rowMode === 'array' ? [[1]] : [{ value: 1 }])

        let callbackCount = 0
        const failedRead = new Promise((resolve, reject) => {
          cursor.read(batchSize, (error) => {
            callbackCount++
            error ? reject(error) : resolve()
          })
        })
        const queuedRead = cursor.read(1)
        const results = await Promise.allSettled([failedRead, queuedRead])
        for (const result of results) {
          assert.strictEqual(result.status, 'rejected')
          assert.strictEqual(result.reason, parserError)
        }

        await cursor.close()
        await assert.rejects(cursor.read(1), (error) => error === parserError)
        const result = await client.query('SELECT 42 AS answer, (SELECT count(*)::int FROM pg_cursors) AS cursors')
        assert.deepStrictEqual(result.rows, [{ answer: 42, cursors: 0 }])
        assert.strictEqual(callbackCount, 1)
        assert.deepStrictEqual(emittedErrors, [parserError])
        assert.strictEqual(endCount, 0)
        assert.deepStrictEqual(parsedValues, ['1', '2', '3'])
      })
    }
  }
})

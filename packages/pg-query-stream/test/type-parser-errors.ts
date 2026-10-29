import assert from 'assert'
import pg from 'pg'
import QueryStream from '../src'

describe('type parser errors', () => {
  it('closes a flowing stream once and allows the queued query to finish', async () => {
    const client = new pg.Client()
    await client.connect()
    try {
      const parserError = new Error('cannot decode value')
      const stream = new QueryStream('SELECT value FROM generate_series(1, 6) value', [], {
        batchSize: 2,
        types: {
          getTypeParser: () => (value) => {
            if (value === '3') throw parserError
            return Number(value)
          },
        },
      })
      const emittedErrors = []
      const callbackErrors = []
      let closeCount = 0
      stream.on('data', (row) => assert(row.value < 3))
      stream.on('error', (error) => emittedErrors.push(error))
      stream.on('close', () => closeCount++)
      const closed = new Promise<void>((resolve) => stream.once('close', resolve))
      stream.callback = (error) => callbackErrors.push(error)
      client.query(stream)
      const queued = client.query('SELECT 42 AS answer, (SELECT count(*)::int FROM pg_cursors) AS cursors')
      const [result] = await Promise.all([queued, closed])
      assert.deepStrictEqual(result.rows, [{ answer: 42, cursors: 0 }])
      assert.deepStrictEqual(callbackErrors, [parserError])
      assert.deepStrictEqual(emittedErrors, [parserError])
      assert.strictEqual(closeCount, 1)
    } finally {
      await client.end()
    }
  })

  for (const batchSize of [2, 20]) {
    it(`rejects iteration and releases the portal with batchSize=${batchSize}`, async () => {
      const client = new pg.Client()
      await client.connect()
      try {
        const parserError = new Error('cannot decode value')
        const stream = new QueryStream('SELECT value FROM generate_series(1, 6) value', [], {
          batchSize,
          types: {
            getTypeParser: () => (value) => {
              if (value === '3') throw parserError
              return Number(value)
            },
          },
        })
        const callbackErrors = []
        const emittedErrors = []
        let closeCount = 0
        stream.on('error', (error) => emittedErrors.push(error))
        stream.on('close', () => closeCount++)
        stream.callback = (error) => callbackErrors.push(error)
        client.query(stream)

        await assert.rejects(
          async () => {
            for await (const row of stream) {
              assert(row.value < 3)
            }
          },
          (error) => error === parserError
        )

        const result = await client.query('SELECT 42 AS answer, (SELECT count(*)::int FROM pg_cursors) AS cursors')
        assert.deepStrictEqual(result.rows, [{ answer: 42, cursors: 0 }])
        assert.deepStrictEqual(callbackErrors, [parserError])
        assert.deepStrictEqual(emittedErrors, [parserError])
        assert.strictEqual(closeCount, 1)
      } finally {
        await client.end()
      }
    })
  }
})

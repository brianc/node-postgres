'use strict'
const helper = require('./test-helper')
const assert = require('assert')
const { Query } = helper.pg

const suite = new helper.Suite()

const badValue = {
  toPostgres() {
    throw new Error('bad value')
  },
}

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

for (const pipeline of [false, true]) {
  const label = pipeline ? ' (pipeline)' : ''

  suite.test(
    'callback runs once when a value fails to serialize' + label,
    !helper.args.native &&
      async function () {
        const client = helper.client(undefined, { pipeline })
        try {
          const results = []
          client.query('SELECT $1::text AS v', [badValue], (err, res) => results.push(err ? err.message : res.rows))
          if (!pipeline) {
            await settle(50)
          }
          const next = await client.query('SELECT 42 AS answer')
          await settle(50)
          assert.deepStrictEqual(results, ['bad value'])
          assert.strictEqual(next.rows[0].answer, 42)
        } finally {
          await client.end()
        }
      }
  )

  suite.test(
    'no end event after the error when a value fails to serialize' + label,
    !helper.args.native &&
      async function () {
        const client = helper.client(undefined, { pipeline })
        try {
          const events = []
          const query = new Query('SELECT $1::text AS v', [badValue])
          query.on('error', (err) => events.push(err.message))
          query.on('end', () => events.push('end'))
          client.query(query)
          if (!pipeline) {
            await settle(50)
          }
          await client.query('SELECT 1')
          await settle(50)
          assert.deepStrictEqual(events, ['bad value'])
        } finally {
          await client.end()
        }
      }
  )
}

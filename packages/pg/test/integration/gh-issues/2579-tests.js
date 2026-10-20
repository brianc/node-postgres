'use strict'
const assert = require('assert')
const helper = require('../test-helper')

const suite = new helper.Suite()
const maxParameterCount = 0xffff
const errorMessage = `PostgreSQL supports a maximum of ${maxParameterCount} parameters, but ${
  maxParameterCount + 1
} were supplied`

suite.test(
  'rejects too many parameters and keeps the connection usable',
  !helper.args.native &&
    async function () {
      const client = new helper.Client()
      await client.connect()
      try {
        await assert.rejects(client.query({ text: 'select $1', values: new Array(maxParameterCount + 1) }), {
          name: 'RangeError',
          message: errorMessage,
        })

        const result = await client.query('select 1 as value')
        assert.equal(result.rows[0].value, 1)
      } finally {
        await client.end()
      }
    }
)

suite.test(
  'isolates an oversized query in pipeline mode',
  !helper.args.native &&
    async function () {
      const client = new helper.Client({ pipeline: true })
      await client.connect()
      try {
        const results = await Promise.allSettled([
          client.query('select 1 as value'),
          client.query({ text: 'select $1', values: new Array(maxParameterCount + 1) }),
          client.query('select 2 as value'),
        ])

        assert.equal(results[0].status, 'fulfilled')
        assert.equal(results[0].value.rows[0].value, 1)
        assert.equal(results[1].status, 'rejected')
        assert(results[1].reason instanceof RangeError)
        assert.equal(results[1].reason.message, errorMessage)
        assert.equal(results[2].status, 'fulfilled')
        assert.equal(results[2].value.rows[0].value, 2)
      } finally {
        await client.end()
      }
    }
)

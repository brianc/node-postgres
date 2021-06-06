'use strict'

const pg = require('../../../lib')
const helper = require('../test-helper')
var Query = helper.pg.Query

const suite = new helper.Suite()

suite.test('empty query.callback do not throw fatal exception', async (done) => {
  const config = {
    query_timeout: 100,
  }
  const notExpectedErr = new Error('queryCallback is not a function')
  var errorReceived = undefined

  try {
    var client = new Client(config)
    await client.connect()
    var sleepQuery = 'select pg_sleep($1)'
    var queryConfig = {
      name: 'sleep query',
      text: sleepQuery,
      values: [2],
      callback: undefined,
    }
    await client.query(new Query(queryConfig))
    client.end()
  } catch (error) {
    errorReceived = error
  }
  if (errorReceived === notExpectedErr) {
    done(new Error('Received error queryCallback is not a function'))
  }
  done()
})

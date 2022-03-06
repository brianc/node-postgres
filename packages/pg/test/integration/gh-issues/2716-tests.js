'use strict'
const helper = require('../test-helper')

const suite = new helper.Suite()

// https://github.com/brianc/node-postgres/issues/2716
suite.testAsync('client.end() should resolve if already ended', async () => {
  const client = new helper.pg.Client()
  await client.connect()
  await client.end()
  // connection "end" event is emitted twice; once on stream "close" and once
  // on stream "end" so we need to make sure our second client.end() is not
  // resolved by these.
  await sleep(1)
  await client.end() // this should resolve early, rather than waiting forever
})

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

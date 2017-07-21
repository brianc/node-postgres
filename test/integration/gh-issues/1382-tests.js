"use strict"
var helper = require('./../test-helper')

const suite = new helper.Suite()

suite.test('calling end during active query should return a promise', (done) => {
  const client = new helper.pg.Client()
  let callCount = 0
  // ensure both the query rejects and the end promise resolves
  const after = () => {
    if (++callCount > 1) {
      done()
    }
  }
  client.connect().then(() => {
    client.query('SELECT NOW()').catch(after)
    client.end().then(after)
  })
})

suite.test('calling end during an active query should call end callback', (done) => {
  const client = new helper.pg.Client()
  let callCount = 0
  // ensure both the query rejects and the end callback fires
  const after = () => {
    if (++callCount > 1) {
      done()
    }
  }
  client.connect().then(() => {
    client.query('SELECT NOW()').catch(after)
    client.end(after)
  })
})

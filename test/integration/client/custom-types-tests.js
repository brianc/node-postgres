'use strict'
const helper = require('./test-helper')
const Client = helper.pg.Client
const suite = new helper.Suite()

const client = new Client({
  types: {
    getTypeParser: () => () => 'okay!'
  }
})

suite.test('custom type parser in client config', (done) => {
  client.connect()
    .then(() => {
      client.query('SELECT NOW() as val', assert.success(function (res) {
        assert.equal(res.rows[0].val, 'okay!')
        client.end().then(done)
      }))
    })
})

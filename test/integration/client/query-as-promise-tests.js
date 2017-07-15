'use strict'
var helper = require(__dirname + '/../test-helper')
var pg = helper.pg

process.on('unhandledRejection', function (e) {
  console.error(e, e.stack)
  process.exit(1)
})

const pool = new pg.Pool()
const suite = new helper.Suite()

suite.test('promise API', (cb) => {
  pool.connect().then((client) => {
    client.query('SELECT $1::text as name', ['foo'])
      .then(function (result) {
        assert.equal(result.rows[0].name, 'foo')
        return client
      })
      .then(function (client) {
        client.query('ALKJSDF')
          .catch(function (e) {
            assert(e instanceof Error)
            client.query('SELECT 1 as num')
              .then(function (result) {
                assert.equal(result.rows[0].num, 1)
                client.release()
                pool.end(cb)
              })
          })
      })
  })
})

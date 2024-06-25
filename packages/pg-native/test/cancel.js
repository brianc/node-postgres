var Client = require('../')
var assert = require('assert')

describe('cancel query', function () {
  it('works', function (done) {
    var client = new Client()
    client.connectSync()
    client.query('SELECT pg_sleep(1000);', function (err) {
      assert(err instanceof Error)
      client.end(done)
    })
    setTimeout(() => {
      client.cancel(function (err) {
        assert.ifError(err)
      })
    }, 100)
  })

  it('does not raise error if no active query', function (done) {
    var client = new Client()
    client.connectSync()
    client.cancel(function (err) {
      assert.ifError(err)
      done()
    })
  })

  it('raises error if client is not connected', function (done) {
    new Client().cancel(function (err) {
      assert(err, 'should raise an error when not connected')
      done()
    })
  })
})

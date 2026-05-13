const Client = require('../')
const async = require('async')
const ok = require('okay')

const execute = function (x, done) {
  const client = new Client()
  client.connectSync()
  const query = function (n, cb) {
    client.query('SELECT $1::int as num', [n], function (err) {
      cb(err)
    })
  }
  return async.timesSeries(
    5,
    query,
    ok(done, function () {
      client.end()
      done()
    })
  )
}
describe('Load tests', function () {
  it('single client and many queries', function (done) {
    async.times(1, execute, done)
  })

  it('multiple client and many queries', function (done) {
    async.times(20, execute, done)
  })
})

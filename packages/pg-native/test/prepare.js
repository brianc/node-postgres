const Client = require('../')
const ok = require('okay')
const async = require('async')

describe('async prepare', function () {
  const run = function (n, cb) {
    const client = new Client()
    client.connectSync()

    const exec = function (x, done) {
      client.prepare('get_now' + x, 'SELECT NOW()', 0, done)
    }

    async.timesSeries(
      10,
      exec,
      ok(cb, function () {
        client.end(cb)
      })
    )
  }

  const t = function (n) {
    it('works for ' + n + ' clients', function (done) {
      async.times(n, run, function (err) {
        done(err)
      })
    })
  }

  for (let i = 0; i < 10; i++) {
    t(i)
  }
})

describe('async execute', function () {
  const run = function (n, cb) {
    const client = new Client()
    client.connectSync()
    client.prepareSync('get_now', 'SELECT NOW()', 0)
    const exec = function (x, cb) {
      client.execute('get_now', [], cb)
    }
    async.timesSeries(
      10,
      exec,
      ok(cb, function () {
        client.end(cb)
      })
    )
  }

  const t = function (n) {
    it('works for ' + n + ' clients', function (done) {
      async.times(n, run, function (err) {
        done(err)
      })
    })
  }

  for (let i = 0; i < 10; i++) {
    t(i)
  }
})

const Client = require('../')
const async = require('async')
const ok = require('okay')
const bytes = require('crypto').pseudoRandomBytes

describe('many connections', function () {
  describe('async', function () {
    const test = function (count, times) {
      it(`connecting ${count} clients ${times} times`, function (done) {
        this.timeout(200000)

        const connectClient = function (n, cb) {
          const client = new Client()
          client.connect(
            ok(cb, function () {
              bytes(
                1000,
                ok(cb, function (chunk) {
                  client.query(
                    'SELECT $1::text as txt',
                    [chunk.toString('base64')],
                    ok(cb, function (rows) {
                      client.end(cb)
                    })
                  )
                })
              )
            })
          )
        }

        const run = function (n, cb) {
          async.times(count, connectClient, cb)
        }

        async.timesSeries(times, run, done)
      })
    }

    test(1, 1)
    test(5, 5)
    test(10, 10)
    test(20, 20)
    test(30, 10)
  })
})

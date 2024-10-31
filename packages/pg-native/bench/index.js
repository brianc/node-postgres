const pg = require('pg').native
const Native = require('../')

const warmup = function (fn, cb) {
  let count = 0
  const max = 10
  const run = function (err) {
    if (err) return cb(err)

    if (max >= count++) {
      return fn(run)
    }

    cb()
  }
  run()
}

const native = Native()
native.connectSync()

const queryText = 'SELECT generate_series(0, 1000)'
const client = new pg.Client()
client.connect(function () {
  const pure = function (cb) {
    client.query(queryText, function (err) {
      if (err) throw err
      cb(err)
    })
  }
  const nativeQuery = function (cb) {
    native.query(queryText, function (err) {
      if (err) throw err
      cb(err)
    })
  }

  const run = function () {
    let start = Date.now()
    warmup(pure, function () {
      console.log('pure done', Date.now() - start)
      start = Date.now()
      warmup(nativeQuery, function () {
        console.log('native done', Date.now() - start)
      })
    })
  }

  setInterval(function () {
    run()
  }, 500)
})

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

const queryText = 'SELECT generate_series(0, 1000) as X, generate_series(0, 1000) as Y, generate_series(0, 1000) as Z'
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
    console.time('pure')
    warmup(pure, function () {
      console.timeEnd('pure')
      console.time('native')
      warmup(nativeQuery, function () {
        console.timeEnd('native')
      })
    })
  }

  setInterval(function () {
    run()
  }, 500)
})

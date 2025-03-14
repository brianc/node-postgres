var pg = require('pg').native
var Native = require('../')

var warmup = function (fn, cb) {
  var count = 0
  var max = 10
  var run = function (err) {
    if (err) return cb(err)

    if (max >= count++) {
      return fn(run)
    }

    cb()
  }
  run()
}

var native = Native()
native.connectSync()

var queryText = 'SELECT generate_series(0, 1000) as X, generate_series(0, 1000) as Y, generate_series(0, 1000) as Z'
var client = new pg.Client()
client.connect(function () {
  var pure = function (cb) {
    client.query(queryText, function (err) {
      if (err) throw err
      cb(err)
    })
  }
  var nativeQuery = function (cb) {
    native.query(queryText, function (err) {
      if (err) throw err
      cb(err)
    })
  }

  var run = function () {
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

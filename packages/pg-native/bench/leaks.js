const Client = require('../')
const async = require('async')

const loop = function () {
  const client = new Client()

  const connect = function (cb) {
    client.connect(cb)
  }

  const simpleQuery = function (cb) {
    client.query('SELECT NOW()', cb)
  }

  const paramsQuery = function (cb) {
    client.query('SELECT $1::text as name', ['Brian'], cb)
  }

  const prepared = function (cb) {
    client.prepare('test', 'SELECT $1::text as name', 1, function (err) {
      if (err) return cb(err)
      client.execute('test', ['Brian'], cb)
    })
  }

  const sync = function (cb) {
    client.querySync('SELECT NOW()')
    client.querySync('SELECT $1::text as name', ['Brian'])
    client.prepareSync('boom', 'SELECT $1::text as name', 1)
    client.executeSync('boom', ['Brian'])
    setImmediate(cb)
  }

  const end = function (cb) {
    client.end(cb)
  }

  const ops = [connect, simpleQuery, paramsQuery, prepared, sync, end]

  const start = performance.now()
  async.series(ops, function (err) {
    if (err) throw err
    console.log(performance.now() - start)
    setImmediate(loop)
  })
}

// on my machine this will consume memory up to about 50 megs of ram
// and then stabalize at that point
loop()

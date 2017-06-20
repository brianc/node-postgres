var helper = require('./test-helper')
process.noDeprecation = false
process.on('warning', function () {
  throw new Error('Should not emit deprecation warning')
})

var client = new helper.pg.Client()

client.connect(function (err) {
  if (err) throw err
  client.query('SELECT NOW()')
    .then(function (res) {
      client.query('SELECT NOW()', function () {
        client.end(function () {
        })
      })
    }).catch(function (err) {
      setImmediate(function () {
        throw err
      })
    })
})

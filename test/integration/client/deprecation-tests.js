var helper = require('./test-helper')

process.on('warning', function (warning) {
  console.log(warning)
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

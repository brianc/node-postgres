var helper = require('./test-helper')
process.noDeprecation = false
process.on('warning', function () {
  throw new Error('Should not emit deprecation warning')
})

var client = new helper.pg.Client()

client.connect(function (err) {
  console.log('connected')
  client.query('SELECT NOW()')
    .then(function (res) {
      console.log('got result')
      console.log(res.rows)
      client.end(function () {
        console.log('ended')
      })
    }).catch(function (err) {
      setImmediate(function () {
        throw err
      })
    })
})

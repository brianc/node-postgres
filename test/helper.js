var pg = require('pg.js')
module.exports = function(name, cb) {
  describe(name, function() {
    var client = new pg.Client()

    before(function(done) {
      client.connect(done)
    })

    cb(client)

    after(function(done) {
      client.end()
      client.on('end', done)
    })
  })
}

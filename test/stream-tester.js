var tester = require('stream-tester')
var spec = require('stream-spec')

var QueryStream = require('../')

require('./helper')('stream tester', function(client) {
  it('passes stream spec', function(done) {
    var stream = new QueryStream('SELECT * FROM generate_series(0, 200) num', [])
    var query = client.query(stream)
    spec(query)
    .readable()
    .pausable({strict: true})
    .validateOnExit()
    stream.on('end', done)
  })
})

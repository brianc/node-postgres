var pg = require('pg.js')
var QueryStream = require('../')
var spec = require('stream-spec')
var assert = require('assert')

require('./helper')('stream tester timestamp', function(client) {
  it('should not warn about max listeners', function(done) {
    var sql = 'SELECT * FROM generate_series(\'1983-12-30 00:00\'::timestamp, \'2013-12-30 00:00\', \'1 years\')'
    var result = []
    var stream = new QueryStream(sql, [])
    var ended = false
    var query = client.query(stream)
    query.
      on('end', function() { ended = true })
    spec(query)
      .readable()
      .pausable({strict: true})
      .validateOnExit()
    ;
    var checkListeners = function() {
      assert(stream.listeners('end').length < 10)
      if (!ended)
        setImmediate(checkListeners)
      else
        done()
    }
    checkListeners()
  })
})
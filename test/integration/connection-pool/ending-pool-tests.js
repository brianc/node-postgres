var helper = require('./test-helper')

var called = false;

test('disconnects', function() {
  var sink = new helper.Sink(4, function() {
    called = true;
    var eventSink = new helper.Sink(1, function() {});
    helper.pg.on('end', function() {
      eventSink.add();
    });

    //this should exit the process, killing each connection pool
    helper.pg.end();
  });
  [helper.config, helper.config, helper.config, helper.config].forEach(function(config) {
    helper.pg.connect(config, function(err, client, done) {
      assert.isNull(err);
      client.query("SELECT * FROM NOW()", function(err, result) {
        setTimeout(function() {
          assert.equal(called, false, "Should not have disconnected yet")
          sink.add();
          done();
        }, 0)
      })
    })
  })
})



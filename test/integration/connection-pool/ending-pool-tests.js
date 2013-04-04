var helper = require(__dirname + '/test-helper')

var called = false;
test('disconnects', function() {
  var sink = new helper.Sink(4, function() {
    called = true;
    //this should exit the process, killing each connection pool
    helper.pg.end();
  });
  [helper.config, helper.config, helper.config, helper.config].forEach(function(config) {
    helper.pg.connect(config, function(err, client, done) {
      assert.isNull(err);
      client.query("SELECT * FROM NOW()", function(err, result) {
        process.nextTick(function() {
          assert.equal(called, false, "Should not have disconnected yet")
          sink.add();
          done();
        })
      })
    })
  })
})



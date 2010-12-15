var helper = require(__dirname + '/test-helper')
var conString1 = helper.connectionString();
var conString2 = helper.connectionString();
var conString3 = helper.connectionString();
var conString4 = helper.connectionString();

var called = false;
test('disconnects', function() {
  var sink = new helper.Sink(4, function() {
    called = true;
    //this should exit the process, killing each connection pool
    helper.pg.end();
  });
  [conString1, conString2, conString3, conString4].forEach(function() {
    helper.pg.connect(conString1, function(err, client) {
      assert.isNull(err);
      client.query("SELECT * FROM NOW()", function(err, result) {
        process.nextTick(function() {
          assert.equal(called, false, "Should not have disconnected yet")
          sink.add();
        })
      })
    })
  })
})



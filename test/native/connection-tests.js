var helper = require(__dirname + "/../test-helper");
var Client = require(__dirname + "/../../lib/native");

test('connecting with wrong parameters', function() {
  var con = new Client("user=asldfkj hostaddr=127.0.0.1 port=5432 dbname=asldkfj");
  assert.emits(con, 'error', function(error) {
    assert.ok(error != null, "error should not be null");
    con.end();
  });

  con.connect();
});

test('connects', function() {
  var con = new Client(helper.config);
  con.connect();
  assert.emits(con, 'connect', function() {
    test('disconnects', function() {
      con.end();
    })
  })
})

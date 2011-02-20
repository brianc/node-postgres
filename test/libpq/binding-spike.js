var helper = require(__dirname + "/../test-helper");
var Connection = require(__dirname + "/../../lib/libpq").Connection;

test('calling connect without params raises error', function() {
  var con = new Connection();
  var err;
  try{
    con.connect();
  } catch (e) {
    err = e;
  }
  assert.ok(err!=null);
});

test('connecting with wrong parameters', function() {
  var con = new Connection();
  con.connect("user=asldfkj hostaddr=127.0.0.1 port=5432 dbname=asldkfj");
  assert.emits(con, 'error')
});


test('connects', function() {
  var con = new Connection();
  con.connect("user=brian hostaddr=127.0.0.1 port=5432 dbname=postgres");
  assert.emits(con, 'connect', function() {
    con._sendQuery("SELECT NOW()");
  });
})

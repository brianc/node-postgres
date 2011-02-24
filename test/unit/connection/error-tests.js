var helper = require(__dirname + '/test-helper');
var Connection = require('connection');
var con = new Connection({stream: new MemoryStream()});
test("connection emits stream errors", function() {
  assert.emits(con, 'error', function(err) {
    assert.equal(err, "OMG!");
  });
  con.connect();
  con.stream.emit('error', "OMG!");
});

var helper = require(__dirname + "/../test-helper");
var pg = require(__dirname + "/../../../lib");
helper.pg = pg;

var testPoolSize = function(max) {
  var conString = helper.connectionString();
  var sink = new helper.Sink(max, function() {
    helper.pg.end(conString);
  });

  test("can pool " + max + " times", function() {
    for(var i = 0; i < max; i++) {
      helper.pg.poolSize = 10;
      test("connection  #" + i + " executes", function() {
        helper.pg.connect(conString, function(err, client) {
          assert.isNull(err);
          client.query("select * from person", function(err, result) {
            assert.length(result.rows, 26)
          })
          client.query("select count(*) as c from person", function(err, result) {
            assert.equal(result.rows[0].c, 26)
          })
          var query = client.query("SELECT * FROM NOW()")
          query.on('end',function() {
            sink.add()
          })
        })
      })
    }
  })
}

module.exports = {
  args: helper.args,
  pg: helper.pg,
  connectionString: helper.connectionString,
  Sink: helper.Sink,
  testPoolSize: testPoolSize
}


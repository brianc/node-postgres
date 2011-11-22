var helper = require(__dirname + "/../test-helper");

helper.testPoolSize = function(max) {
  var sink = new helper.Sink(max, function() {
    helper.pg.end();
  });

  test("can pool " + max + " times", function() {
    for(var i = 0; i < max; i++) {
      helper.pg.poolSize = 10;
      test("connection  #" + i + " executes", function() {
        helper.pg.connect(helper.config, function(err, client) {
          assert.isNull(err);
          client.query("select * from person", function(err, result) {
            assert.lengthIs(result.rows, 26)
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

module.exports = helper;


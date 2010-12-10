var helper = require(__dirname + "/test-helper")

setTimeout(function() {
  helper.pg.defaults.poolSize = 10;
  test('executes a single pooled connection/query', function() {
    var args = helper.args;
    var conString = "pg://"+args.user+":"+args.password+"@"+args.host+":"+args.port+"/"+args.database;
    var queryCount = 0;
    helper.pg.connect(conString, assert.calls(function(err, client) {
      assert.isNull(err);
      client.query("select * from NOW()", assert.calls(function(err, result) {
        assert.isNull(err);
        queryCount++;
      }))
    }))
    var id = setTimeout(function() {
      assert.equal(queryCount, 1)
    }, 1000)
    var check = function() {
      setTimeout(function() {
        if(queryCount == 1) {
          clearTimeout(id)
          helper.pg.end();
        } else {
          check();
        }
      }, 50)
    }
    check();
  })
}, 1000)


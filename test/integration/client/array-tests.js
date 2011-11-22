var helper = require(__dirname + "/test-helper");
var pg = helper.pg;

test('parsing array results', function() {
  pg.connect(helper.config, assert.calls(function(err, client) {
    assert.isNull(err);
    client.query("CREATE TEMP TABLE why(names text[], numbors integer[])");
    client.query('INSERT INTO why(names, numbors) VALUES(\'{"aaron", "brian","a b c" }\', \'{1, 2, 3}\')').on('error', console.log);
    test('numbers', function() {
      //      client.connection.on('message', console.log)
      client.query('SELECT numbors FROM why', assert.success(function(result) {
        assert.lengthIs(result.rows[0].numbors, 3);
        assert.equal(result.rows[0].numbors[0], 1);
        assert.equal(result.rows[0].numbors[1], 2);
        assert.equal(result.rows[0].numbors[2], 3);
      }))
    })

    test('parses string arrays', function() {
      client.query('SELECT names FROM why', assert.success(function(result) {
        var names = result.rows[0].names;
        assert.lengthIs(names, 3);
        assert.equal(names[0], 'aaron');
        assert.equal(names[1], 'brian');
        assert.equal(names[2], "a b c");
        pg.end();
      }))
    })
  }))
})



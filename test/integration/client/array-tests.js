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
    
    test('empty array', function(){
      client.query("SELECT '{}'::text[] as names", assert.success(function(result) {
        var names = result.rows[0].names;
        assert.lengthIs(names, 0);
        pg.end();
      }))
    })

    test('element containing comma', function(){
      client.query("SELECT '{\"joe,bob\",jim}'::text[] as names", assert.success(function(result) {
        var names = result.rows[0].names;
        assert.lengthIs(names, 2);
        assert.equal(names[0], 'joe,bob');
        assert.equal(names[1], 'jim');
        pg.end();
      }))
    })

    test('bracket in quotes', function(){
      client.query("SELECT '{\"{\",\"}\"}'::text[] as names", assert.success(function(result) {
        var names = result.rows[0].names;
        assert.lengthIs(names, 2);
        assert.equal(names[0], '{');
        assert.equal(names[1], '}');
        pg.end();
      }))
    })

    test('null value', function(){
      client.query("SELECT '{joe,null,bob,\"NULL\"}'::text[] as names", assert.success(function(result) {
        var names = result.rows[0].names;
        assert.lengthIs(names, 4);
        assert.equal(names[0], 'joe');
        assert.equal(names[1], null);
        assert.equal(names[2], 'bob');
        assert.equal(names[3], 'NULL');
        pg.end();
      }))
    })

    test('element containing quote char', function(){
      client.query("SELECT ARRAY['joe''', 'jim', 'bob\"'] AS names", assert.success(function(result) {
        var names = result.rows[0].names;
        assert.lengthIs(names, 3);
        assert.equal(names[0], 'joe\'');
        assert.equal(names[1], 'jim');
        assert.equal(names[2], 'bob"');
        pg.end();
      }))
    })

    test('nested array', function(){
      client.query("SELECT '{{1,joe},{2,bob}}'::text[] as names", assert.success(function(result) {
        var names = result.rows[0].names;
        assert.lengthIs(names, 2);

        assert.lengthIs(names[0], 2);
        assert.equal(names[0][0], '1');
        assert.equal(names[0][1], 'joe');

        assert.lengthIs(names[1], 2);
        assert.equal(names[1][0], '2');
        assert.equal(names[1][1], 'bob');

        pg.end();
      }))
    })

    test('integer array', function(){
      client.query("SELECT '{1,2,3}'::integer[] as names", assert.success(function(result) {
        var names = result.rows[0].names;
        assert.lengthIs(names, 3);
        assert.equal(names[0], 1);
        assert.equal(names[1], 2);
        assert.equal(names[2], 3);
        pg.end();
      }))
    })

    test('integer nested array', function(){
      client.query("SELECT '{{1,100},{2,100},{3,100}}'::integer[] as names", assert.success(function(result) {
        var names = result.rows[0].names;
        assert.lengthIs(names, 3);
        assert.equal(names[0][0], 1);
        assert.equal(names[0][1], 100);

        assert.equal(names[1][0], 2);
        assert.equal(names[1][1], 100);

        assert.equal(names[2][0], 3);
        assert.equal(names[2][1], 100);
        pg.end();
      }))
    })
    
  }))
})



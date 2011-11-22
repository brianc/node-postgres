var helper = require(__dirname + '/test-helper');

var sink = new helper.Sink(2, function() {
  helper.pg.end();
});

test('a single connection transaction', function() {
  helper.pg.connect(helper.config, assert.calls(function(err, client) {
    assert.isNull(err);

    client.query('begin');

    var getZed = {
      text: 'SELECT * FROM person WHERE name = $1',
      values: ['Zed']
    };

    test('Zed should not exist in the database', function() {
      client.query(getZed, assert.calls(function(err, result) {
        assert.isNull(err);
        assert.empty(result.rows);
      }))
    })

    client.query("INSERT INTO person(name, age) VALUES($1, $2)", ['Zed', 270], assert.calls(function(err, result) {
      assert.isNull(err)
    }));

    test('Zed should exist in the database', function() {
      client.query(getZed, assert.calls(function(err, result) {
        assert.isNull(err);
        assert.equal(result.rows[0].name, 'Zed');
      }))
    })

    client.query('rollback');

    test('Zed should not exist in the database', function() {
      client.query(getZed, assert.calls(function(err, result) {
        assert.isNull(err);
        assert.empty(result.rows);
        sink.add();
      }))
    })
  }))
})

test('gh#36', function() {
  helper.pg.connect(helper.config, function(err, client) {
    if(err) throw err;
    client.query("BEGIN");
    client.query({
      name: 'X',
      text: "SELECT $1::INTEGER",
      values: [0]
    }, assert.calls(function(err, result) {
      if(err) throw err;
      assert.equal(result.rows.length, 1);
    }))
    client.query({
      name: 'X',
      text: "SELECT $1::INTEGER",
      values: [0]
    }, assert.calls(function(err, result) {
      if(err) throw err;
      assert.equal(result.rows.length, 1);
    }))
    client.query("COMMIT", function() {
      sink.add();
    })
  })
})

var helper = require(__dirname + '/../test-helper');
var pg = require(__dirname + '/../../../lib');
var connectionString = helper.connectionString(__filename);


var sink = new helper.Sink(2, function() {
  pg.end(connectionString);
});

test('api', function() {
  pg.connect(connectionString, assert.calls(function(err, client) {
    assert.equal(err, null, "Failed to connect: " + sys.inspect(err));

    client.query('CREATE TEMP TABLE band(name varchar(100))');

    ['the flaming lips', 'wolf parade', 'radiohead', 'bright eyes', 'the beach boys', 'dead black hearts'].forEach(function(bandName) {
      var query = client.query("INSERT INTO band (name) VALUES ('"+ bandName +"')")
    });


    test('simple query execution',assert.calls( function() {
      client.query("SELECT * FROM band WHERE name = 'the beach boys'", function(err, result) {
        assert.length(result.rows, 1)
        assert.equal(result.rows.pop().name, 'the beach boys')
      });

    }))

    test('prepared statement execution',assert.calls( function() {
      client.query('SELECT * FROM band WHERE name = $1', ['dead black hearts'],assert.calls( function(err, result) {
        assert.length(result.rows, 1);
        assert.equal(result.rows.pop().name, 'dead black hearts');
      }))

      client.query('SELECT * FROM band WHERE name LIKE $1 ORDER BY name', ['the %'], assert.calls(function(err, result) {
        assert.length(result.rows, 2);
        assert.equal(result.rows.pop().name, 'the flaming lips');
        assert.equal(result.rows.pop().name, 'the beach boys');
        sink.add();
      }))
    }))

  }))
})

test('executing nested queries', function() {
  pg.connect(connectionString, assert.calls(function(err, client) {
    assert.isNull(err);
    client.query('select now as now from NOW()', assert.calls(function(err, result) {
      assert.equal(new Date().getYear(), result.rows[0].now.getYear())
      client.query('select now as now_again FROM NOW()', assert.calls(function() {
        client.query('select * FROM NOW()', assert.calls(function() {
          assert.ok('all queries hit')
          sink.add();
        }))
      }))
    }))
  }))
})

test('raises error if cannot connect', function() {
  var connectionString = "pg://asdf@seoiasfd:4884/ieieie";
  pg.connect(connectionString, assert.calls(function(err, client) {
    assert.ok(err, 'should have raised an error')
  }))
})

test("query errors are handled and do not bubble if callbac is provded", function() {
  pg.connect(connectionString, assert.calls(function(err, client) {
    assert.isNull(err)
    client.query("SELECT OISDJF FROM LEIWLISEJLSE", assert.calls(function(err, result) {
      assert.ok(err);
    }))
  }))
})

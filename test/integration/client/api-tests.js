var helper = require(__dirname + '/../test-helper');
var pg = require(__dirname + '/../../../lib');

var connected = false
var simpleCalled = false
var preparedCalled = false

pg.connect(helper.args, function(err, client) {
  connected = true
  assert.equal(err, null, "Failed to connect");

  client.query('CREATE TEMP TABLE band(name varchar(100))');

  ['the flaming lips', 'wolf parade', 'radiohead', 'bright eyes', 'the beach boys', 'dead black hearts'].forEach(function(bandName) {
    client.query("INSERT INTO band (name) VALUES ('"+ bandName +"')")
  });


  test('simple query execution', function() {
    client.query("SELECT * FROM band WHERE name = 'the beach boys'", function(err, result) {
      simpleCalled = true
      assert.length(result.rows, 1)
      assert.equal(result.rows.pop().name, 'the beach boys')
    });

  })

  test('prepared statement execution', function() {
    client.query('SELECT * FROM band WHERE name = $1', ['dead black hearts'], function(err, result) {
      preparedCalled = true;
      assert.length(result.rows, 1);
      assert.equal(result.rows.pop().name, 'dead black hearts');
    })

    client.query('SELECT * FROM band WHERE name LIKE $1 ORDER BY name', ['the %'], function(err, result) {
      assert.length(result.rows, 2);
      assert.equal(result.rows.pop().name, 'the flaming lips');
      assert.equal(result.rows.pop().name, 'the beach boys');
    })
  })
})

process.on('exit', function() {
  assert.ok(connected, 'never connected');
  assert.ok(simpleCalled, 'query result callback was never called');
  assert.ok(preparedCalled, 'prepared callback was never called');
})

test('raises error if cannot connect', function() {
  pg.connect({database:'asdlfkajsdf there is no way this is a real database, right?!'}, function(err, client) {
    assert.ok(err, 'error was null')
  })
})

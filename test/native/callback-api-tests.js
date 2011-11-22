var helper = require(__dirname + "/../test-helper");
var Client = require(__dirname + "/../../lib/native");

test('fires callback with results', function() {
  var client = new Client(helper.config);
  client.connect();
  client.query('SELECT 1 as num', assert.calls(function(err, result) {
    assert.isNull(err);
    assert.equal(result.rows[0].num, 1);
    client.query('SELECT * FROM person WHERE name = $1', ['Brian'], assert.calls(function(err, result) {
      assert.isNull(err);
      assert.equal(result.rows[0].name, 'Brian');
      client.end();
    }))
  }));
})

var helper = require(__dirname + '/test-helper');
var util = require('util');

test('error during query execution', function() {
  var client = new Client(helper.args);
  process.removeAllListeners('uncaughtException');
  assert.emits(process, 'uncaughtException', function() {
    assert.equal(client.activeQuery, null, 'should remove active query even if error happens in callback');
    client.query('SELECT * FROM blah', assert.success(function(result) {
      assert.equal(result.rows.length, 1);
      client.end();
    }));
  });
  client.connect(assert.success(function() {
    client.query('CREATE TEMP TABLE "blah"(data text)', assert.success(function() {
      var q = client.query('INSERT INTO blah(data) VALUES($1)', ['yo'], assert.success(function() {
        assert.emits(client, 'drain');
        throw new Error('WHOOOAAAHH!!');
      }));
    }));
  }));
});

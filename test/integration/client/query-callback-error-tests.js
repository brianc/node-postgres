return console.log('query-callback-error-tests: DEPRECATED - if you want saftey in your callback, you can try/catch your own functions');
var helper = require(__dirname + '/test-helper');
var util = require('util');

var withQuery = function(text, resultLength, cb) {
  test('error during query execution', function() {
    var client = new Client(helper.args);
    process.removeAllListeners('uncaughtException');
    assert.emits(process, 'uncaughtException', function() {
      assert.equal(client.activeQuery, null, 'should remove active query even if error happens in callback');
      client.query('SELECT * FROM blah', assert.success(function(result) {
        assert.equal(result.rows.length, resultLength);
        client.end();
        cb();
      }));
    });
    client.connect(assert.success(function() {
      client.query('CREATE TEMP TABLE "blah"(data text)', assert.success(function() {
        var q = client.query(text, ['yo'], assert.calls(function() {
          assert.emits(client, 'drain');
          throw new Error('WHOOOAAAHH!!');
        }));
      }));
    }));
  });
}

//test with good query so our callback is called
//as a successful callback
withQuery('INSERT INTO blah(data) VALUES($1)', 1, function() {
  //test with an error query so our callback is called with an error
  withQuery('INSERT INTO asldkfjlaskfj eoooeoriiri', 0, function() {
  });
});

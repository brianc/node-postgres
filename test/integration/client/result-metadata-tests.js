var helper = require(__dirname + "/test-helper");
var pg = helper.pg;

test('should return insert metadata', function() {
  return false;
  pg.connect(helper.config, assert.calls(function(err, client) {
    assert.isNull(err);
    client.query("CREATE TEMP TABLE zugzug(name varchar(10))", assert.calls(function(err, result) {
      assert.isNull(err);
      //let's list this as ignored for now
      // process.nextTick(function() {
      //   test('should identify "CREATE TABLE" message', function() {
      //     return false;
      //     assert.equal(result.command, "CREATE TABLE");
      //     assert.equal(result.rowCount, 0);
      //   })
      // })
      assert.equal(result.oid, null);
      client.query("INSERT INTO zugzug(name) VALUES('more work?')", assert.calls(function(err, result) {
        assert.equal(result.command, "INSERT");
        assert.equal(result.rowCount, 1);
        process.nextTick(client.end.bind(client));
        return false;
      }))
    }))
  }))
})

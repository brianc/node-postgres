var helper = require(__dirname + "/test-helper")

var testForTag = function(tagText, callback) {
  test('includes command tag data for tag ' + tagText, function() {

    var client = helper.client();
    client.connection.emit('readyForQuery')

    var query = client.query("whatever");
    assert.lengthIs(client.connection.queries, 1)

    assert.emits(query, 'end', function(result) {
      assert.ok(result != null, "should pass something to this event")
      callback(result)
    })

    client.connection.emit('commandComplete', {
      text: tagText
    });

    client.connection.emit('readyForQuery');
  })
}

var check = function(oid, rowCount, command) {
  return function(result) {
    if(oid != null) {
      assert.equal(result.oid, oid);
    }
    assert.equal(result.rowCount, rowCount);
    assert.equal(result.command, command);
  }
}

testForTag("INSERT 0 3", check(0, 3, "INSERT"));
testForTag("INSERT 841 1", check(841, 1, "INSERT"));
testForTag("DELETE 10", check(null, 10, "DELETE"));
testForTag("UPDATE 11", check(null, 11, "UPDATE"));
testForTag("SELECT 20", check(null, 20, "SELECT"));

var helper = require(__dirname+'/test-helper');
var client = helper.client();

test("empty query message handling", function() {
  var query = client.query("");
  assert.emits(query, 'end');
  client.on('drain', client.end.bind(client));
});

test('callback supported', assert.calls(function() {
  client.query("", function(err, result) {
    assert.isNull(err);
    assert.empty(result.rows);
  })
}))


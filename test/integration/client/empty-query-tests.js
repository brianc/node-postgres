var helper = require(__dirname+'/test-helper');
var client = helper.client();

test("empty query message handling", function() {
  assert.emits(client, 'drain', function() {
    client.end();
  });
  client.query({text: "", binary: false});
});

test('callback supported', assert.calls(function() {
  client.query({text: "", binary: false}, function(err, result) {
    assert.isNull(err);
    assert.empty(result.rows);
  })
}))


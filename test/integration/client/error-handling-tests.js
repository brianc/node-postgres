var helper = require(__dirname + '/test-helper');

test('error handling', function(){
  var client = helper.client();
  client.query("select omfg from yodas_soda where pixistix = 'zoiks!!!'");
  assert.raises(client, 'error', function(error) {
    assert.equal(error.severity, "ERROR");
    client.end();
  });
});

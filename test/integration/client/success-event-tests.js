var helper = require(__dirname+"/test-helper");

test('success event', function() {
  
  var client = helper.client();
  
  // Check `success` fires on normal query
  var query1 = client.query("select 'hello world' as phrase"),
      value1 = false;
  
  query1.on('success', function (result) {
    value1 = true;
  })
  .on('error', function (err) {
    assert.fail(err, null, 'error when no error expected', ':');
  })
  .on('end', function () {
    assert.strictEqual(value1, true, 'success event did not fire when expected');
  });
  
  // Check `success` does not fire when error in query
  var query2 = client.query("select illegal as phrase"),
      value2 = false;
  
  query2.on('success', function (result) {
    value2 = true;
  })
  .on('error', function (err) {
    assert.ok(err, 'no error when error expected');
  })
  .on('end', function () {
    assert.strictEqual(value2, false, 'success event did fire when not expected');
  });
  
  client.on('drain', client.end.bind(client));
  
});
var helper = require(__dirname + "/../test-helper");
var Client = require(__dirname + "/../../lib/native").Client;
var conString = helper.connectionString();

test('fires callback with results', function() {
  var client = new Client(conString);
  var q = client.query('SELECT 1', assert.calls(function(err, result) {
    
  }));
  q.on('row', function(row) {
    console.log(row);
  })
})

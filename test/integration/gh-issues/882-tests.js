//client should not hang on an empty query
var helper = require('../test-helper');
var client = helper.client();
client.query({ name: 'foo1', text: null});
client.query({ name: 'foo2', text: '   ' });
client.query({ name: 'foo3', text: '' }, function(err, res) {
  client.end();
});

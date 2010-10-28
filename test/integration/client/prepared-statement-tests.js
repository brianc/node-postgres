var helper = require(__dirname +'/test-helper');

test("simple prepared statement", function(){
  var client = helper.client();
  client.connection.on('message', function(msg) {
    console.log(msg.name);
  });
  var query = client.query({
    text: 'select age from person where name = $1',
    values: ['Brian']
  });

  assert.raises(query, 'row', function(row) {
    assert.equal(row.fields[0], 20);
  });

  assert.raises(query, 'end', function() {
    client.end();
  });
});

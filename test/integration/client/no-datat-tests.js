var helper = require(__dirname + '/test-helper');

test("noData message handling", function() {
  return false;
  var client = helper.client();

  client.query({
    name: 'boom',
    text: 'create temp table boom(id serial, size integer)'
  });
  
  client.query({
    name: 'insert',
    text: 'insert into boom(size) values($1)',
    values: [100]
  });

  client.query({
    name: 'insert',
    values: [101]
  });

  client.connection.on('message', console.log);

  var x = client.query({
    name: 'fetch',
    text: 'select size from boom'
  });

  assert.raises(x, 'row', function(row) {
    assert.equal(row.fields[0], 100);
    
    assert.raises(x, 'row', function(row) {
      assert.equal(row.fields[0], 101);
    });
  });
  
  x.on('end', query.end());
  
});

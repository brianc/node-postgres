var helper = require(__dirname + '/test-helper');

test("noData message handling", function() {

  var client = helper.client();

  var q = client.query({
    name: 'boom',
    text: 'create temp table boom(id serial, size integer)'
  });

  client.query({
    name: 'insert',
    text: 'insert into boom(size) values($1)',
    values: [100]
  }, function(err, result) {
    if(err) {
      console.log(err);
      throw err;
    }
  });

  client.query({
    name: 'insert',
    text: 'insert into boom(size) values($1)',
    values: [101]
  });

  var query = client.query({
    name: 'fetch',
    text: 'select size from boom where size < $1',
    values: [101]
  });

  assert.emits(query, 'row', function(row) {
    assert.strictEqual(row.size,100)
  });

  client.on('drain', client.end.bind(client));

});

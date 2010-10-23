require(__dirname+"/test-helper");
//http://developer.postgresql.org/pgdocs/postgres/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY
var client = createClient();
client.stream.emit('data', buffers.readyForQuery());
//client sends parse message

test('prepared queries', function() {

  test("parse messages", function() {

    test('parsing a query with no parameters', function() {
      client.parse('!');
      assert.length(client.stream.packets, 1);
    });

  });

  //server raises parse complete message

  test('sends bind message', function() {
    return false;
  });

  test('recieves rows', function() {
    return false;
  });

});

require(__dirname+"/test-helper");
//http://developer.postgresql.org/pgdocs/postgres/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY
var client = createClient();
client.stream.emit('data', buffers.readyForQuery());
//client sends parse message

test('prepared queries', function() {

  test("parse messages", function() {

    test('parsing a query with no parameters and no name', function() {
      client.parse({text: '!'});
      assert.length(client.stream.packets, 1);
      var expected = new BufferList()
        .addCString("")
        .addCString("!")
        .addInt16(0).join(true, 'P');
      assert.equalBuffers(client.stream.packets.pop(), expected);
      client.stream.emit('data', buffers.readyForQuery());
    });

    test('parsing a query with a name', function() {
      //clear packets
      client.parse({
        name: 'boom',
        text: 'select * from boom',
        types: []
      });
      assert.length(client.stream.packets, 1);
      var expected = new BufferList()
        .addCString("boom")
        .addCString("select * from boom")
        .addInt16(0).join(true,'P');
      assert.equalBuffers(client.stream.packets.pop(), expected);
      client.stream.emit('data', buffers.readyForQuery());
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

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

    test('binding to unnamed prepared statement with no values', function() {

      client.bind();
      assert.length(client.stream.packets, 1);
      var packet = client.stream.packets.pop();
      var expectedBuffer = new BufferList()
        .addCString("")
        .addCString("")
        .addInt16(0)
        .addInt16(0)
        .addInt16(0).join(true,"B");
      assert.equalBuffers(packet, expectedBuffer);
    });

  });

  test('sends execute message', function() {
    test('executing an unnamed portal with no row limit', function() {
      client.execute();
      assert.length(client.stream.packets, 1);
      var packet = client.stream.packets.pop();
      var expectedBuffer = new BufferList()
        .addCString('')
        .addInt32(0)
        .join(true,'E');
      assert.equalBuffers(packet, expectedBuffer);

    });

  });

  test('sends flush command', function() {
    client.flush();
    assert.length(client.stream.packets, 1);
    var packet = client.stream.packets.pop();
    var expected = new BufferList().join(true, 'H');
    assert.equalBuffers(packet, expected);
  });

  test('sends sync command', function() {
    client.sync();
    assert.length(client.stream.packets, 1);
    var packet = client.stream.packets.pop();
    var expected = new BufferList().join(true,'S');
    assert.equalBuffers(packet, expected);
  });

});

require(__dirname+'/test-helper');

test('client can take existing stream', function() {
  var stream = new MemoryStream();
  var client = new Client({
    stream: stream
  });
  assert.equal(client.stream, stream);
});

test('using closed stream', function() {
  var stream = new MemoryStream();
  stream.readyState = 'closed';
  stream.connect = function(port, host) {
    this.connectCalled = true;
    this.port = port;
    this.host = host;
  }
  var client = new Client({
    stream: stream,
    user: '!',
    database: 'x',
    host: 'bang',
    port: 1234
  });
  client.connect();

  test('makes stream connect', function() {
    assert.equal(stream.connectCalled, true);
  });

  test('uses configured port', function() {
    assert.equal(stream.port, 1234);
  });

  test('uses configured host', function() {
    assert.equal(stream.host, 'bang');
  });

  test('after stream connects', function() {
    stream.emit('connect');

    test('sends connection packet', function() {
      assert.length(stream.packets, 1);
      var expectedBuffer = new BufferList()
        .add(Buffer([0,3,0, 0]))//version
        .addCString('user')
        .addCString('!')
        .addCString('database')
        .addCString('x')
        .addCString("") //final terminator
        .join(true);
      assert.equalBuffers(stream.packets[0], expectedBuffer);
    });

  });


});

test('using opened stream', function() {
  var stream = new MemoryStream();
  stream.readyState = 'open';
  stream.connect = function() {
    assert.ok(false, "Should not call open");
  };
  var client = new Client({stream: stream});
  test('does not call open', function() {
    client.connect();
  });
});

test('query queue', function() {

  var stream = new MemoryStream();

  stream.readyState = 'open';

  var client = new Client({
    stream: stream
  });
  client.connect();

  test('new client has empty queue', function() {
    assert.empty(client.queryQueue);
  });

  test('calling query queues the query object', function() {
    var query = client.query('!');
    assert.length(client.queryQueue, 1);
  });

  test('sends query after stream emits ready for query packet', function() {
    assert.empty(stream.packets);
    var handled = stream.emit('data', buffers.readyForQuery());
    assert.ok(handled, "Stream should have had data handled");
    assert.length(stream.packets, 1);
    assert.equalBuffers(stream.packets[0], [0x51,0,0,0,6,33,0])
  });

});

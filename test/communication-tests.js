require(__dirname+'/test-helper');
var buffers = require(__dirname+'/test-buffers');

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
  var client = new Client({stream: stream});
  test('new client has empty queue', function() {
    assert.empty(client.queryQueue);
  });

  test('calling query queues the query object', function() {
    var query = client.query('select * from bang');
    assert.length(client.queryQueue, 1);
  });

  assert.empty(stream.packets);

  stream.emit('data', buffers.readyForQuery());
  assert.length(stream.packets, 1);
});

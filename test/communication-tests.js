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
  
  test('after stream connects', function() {
    stream.emit('connect');
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
    assert.equalBuffers(stream.packets[0], [0x51,0,0,0,5,33])
  });

});

var dataTypes = {
  char: 18
};

test('simple query scenario', function() {
  var stream = new MemoryStream();
  stream.readyState = 'open';
  var client = new Client({
    stream: stream
  });
  client.connect();
  assert.ok(stream.emit('data', buffers.readyForQuery()));

  var query = client.query('!');
  test('stream got packet', function() {
    assert.length(stream.packets, 1);
  });

  stream.emit('data', buffers.rowDescription([{
    name: 'id',
    dataTypeID: dataTypes.char,
    dataTypeSize: 1
  }]));

  var rowData = [];
  query.on('row',function(data) {
    rowData = data;
  });
  
  var ended = 0;
  query.on('end', function() {
    ended++;
  });

  stream.emit('data', buffers.dataRow(["!"]));

  test('row has one item', function() {
    assert.length(rowData, 1);
  });

  test('row has correct data', function() {
    assert.equal(rowData[0], "!");
  });


  test('query ends', function() {
    stream.emit('data', buffers.commandComplete());
    assert.equal(ended, 1);
  });
  
  test('after query is ended, it emits nothing else', function() {
    stream.emit('data', buffers.dataRow(["X","Y","Z"]));
    stream.emit('data', buffers.commandComplete());
    assert.length(rowData, 1);
    assert.equal(ended, 1);
  });

});

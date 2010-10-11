require(__dirname+'/test-helper');

var dataTypes = {
  char: 18
};

test('simple query', function() {
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

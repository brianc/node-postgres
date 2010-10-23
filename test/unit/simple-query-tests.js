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
  
  stream.emit('data', buffers.dataRow(["!"]));


  test('row has correct data', function() {
    assert.length(rowData, 1);
    assert.equal(rowData[0], "!");
  });

});

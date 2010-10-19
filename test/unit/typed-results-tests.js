require(__dirname+"/test-helper");


var queryResult = function(dataTypeID, value) {
  var stream = new MemoryStream();

  var client = new Client({
    stream: stream
  });

  client.connect();

  var query = client.query('whatever');

  var lastRow = [];

  query.on('row', function(row) {
    lastRow = row;
  });

  stream.emit('data', buffers.readyForQuery());

  stream.emit('data', buffers.rowDescription([{
    name: 'col',
    dataTypeID: dataTypeID
  }]));

  stream.emit('data', buffers.dataRow([value]));

  stream.emit('data', buffers.commandComplete());

  assert.length(lastRow, 1);

  return lastRow[0];
};

var testForType = function(nameAsString, typeID, stringVal, expected) {
  test(nameAsString, function() {
    var result = queryResult(typeID, stringVal);
    assert.strictEqual(result, expected);
    return result;
  });
};


test('parses character types', function() {
  testForType('character (char)', 18, 'xyz', 'xyz');
  testForType('character varying (varchar)', 1043, 'xyz!', 'xyz!');
  testForType('text', 25, 'asdfasdf asdf', 'asdfasdf asdf');
});

test('parses numeric types', function() {
  testForType('bigInt (int8)', 20, "1234567890", 1234567890);
  testForType('integer (int4)', 23, '1234567', 1234567);
  testForType('smallint (int2)', 21, '123', 123);
  testForType('numeric (decimal)', 1700, '123.456', 123.456);
  testForType('real (float4)', 700, '123.457', 123.457);
  testForType('doubl precision (float8)', 701, '123.4567', 123.4567);
  testForType('oid', 26, '1038', 1038);
});

test('parses binary data types', function() {
  //TODO
});

test('parses date/time', function() {
  test('time', function() {
    var result = queryResult(1083, '07:37:16-05');
    assert.equal(result.getHours(), 7);
    assert.equal(result.getMinutes(), 37);
    assert.equal(result.getSeconds(), 16);
  });

  test('time with timezone (timez)', function() {
    var result = queryResult(1266, '07:37:16-05');
    //this is not recommended
    //and i'm not sure how to handle time with timezone (timez)
    //please see
    //http://www.postgresql.org/docs/7.4/interactive/datatype-datetime.html
    //section 8.5.3
    assert.equal(result.getHours(), 7);
    assert.equal(result.getMinutes(), 37);
    assert.equal(result.getSeconds(), 16);
  });
  // testForType('timetz (with timezone)', 266);
  // testForType('timestamp', 1114);
  // testForType('timestampz', 1184);
});

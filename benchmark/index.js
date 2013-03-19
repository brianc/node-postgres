var profiler = require('profiler');
var Client = require(__dirname + '/../lib/client');
var buffers = require(__dirname + '/../test/test-buffers');
require(__dirname + '/../test/unit/test-helper');
console.log('');

var stream = new MemoryStream();
stream.readyState = 'open';
var client = new Client({
  stream: stream
});

var rowDescription = new buffers.rowDescription([{
  name: 'name',
  tableID: 1,
  attributeNumber: 1,
  dataTypeID: 25, //text
  typeModifer: 0,
  formatCode: 0 //text format
}]);
var row1 = buffers.dataRow(['Brian']);
var row2 = buffers.dataRow(['Bob']);
var row3 = buffers.dataRow(['The amazing power of the everlasting gobstopper']);
var complete = buffers.commandComplete('SELECT 3');
var ready = buffers.readyForQuery();
var buffer = Buffer.concat([rowDescription, row1, row2, row3, complete, ready]);

client.connect(assert.calls(function() {
  client.connection.emit('readyForQuery');

  var callCount = 0;
  var max = 1000;
  profiler.resume();
  for(var i = 0; i < max; i++) {
    //BEGIN BENCH
    client.query('SELECT * FROM whatever WHERE this = "doesnt even matter"', function(err, res) {
      callCount++;
    });
    //END BENCH
    stream.emit('data', buffer);
  }
  profiler.pause();
  assert.equal(callCount, max);
}));
client.connection.emit('readyForQuery');

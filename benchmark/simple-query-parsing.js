var Client = require(__dirname + '/../lib/client');
var buffers = require(__dirname + '/../test/test-buffers');
require(__dirname + '/../test/unit/test-helper');

var stream = new MemoryStream();
stream.readyState = 'open';
var client = new Client({
  stream: stream
});

var rowDescription = new buffers.rowDescription([{ 
  name: 'id',
  tableID: 1,
  attributeNumber: 1,
  dataTypeID: 23, //int4
  typeModifer: 0,
  formatCode: 0
},{
  name: 'name',
  tableID: 1,
  attributeNumber: 2,
  dataTypeID: 25, //text
  typeModifer: 0,
  formatCode: 0 //text format
}, {
  name: 'comment',
  tableID: 1,
  attributeNumber: 3,
  dataTypeID: 25, //text
  typeModifer: 0,
  formatCode: 0 //text format
}]);
var row1 = buffers.dataRow(['1', 'Brian', 'Something groovy']);
var row2 = buffers.dataRow(['2', 'Bob', 'Testint test']);
var row3 = buffers.dataRow(['3', 'The amazing power of the everlasting gobstopper', 'okay now']);
var complete = buffers.commandComplete('SELECT 3');
var ready = buffers.readyForQuery();
var buffer = Buffer.concat([
                           rowDescription, 
                           row1, row2, row3, 
                           row1, row2, row3, 
                           row1, row2, row3, 
                           complete, ready]);
var bufferSlice = require('buffer-slice');
buffers = bufferSlice(10, buffer);

client.connect(assert.calls(function() {
  client.connection.emit('readyForQuery');
  module.exports = function() {
    return function(done) {
      client.query('SELECT * FROM whatever WHERE this = "doesnt even matter"', function(err, res) {
        assert.equal(res.rows.length, 9);
        done();
      });
      buffers.forEach(stream.emit.bind(stream, 'data'));
    };
  };
}));
client.connection.emit('readyForQuery');

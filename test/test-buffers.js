require(__dirname+'/test-helper');

var buffers = {};
buffers.readyForQuery = function() {
  return new BufferList()
    .add(Buffer('I'))
    .join(true,'Z');
};

buffers.authenticationOk = function() {
  return new BufferList()
    .addInt32(8)
    .join(true, 'R');
};

buffers.parameterStatus = function(name, value) {
  return new BufferList()
    .addCString(name)
    .addCString(value)
    .join(true, 'S');

};

module.exports = buffers;

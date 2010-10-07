require(__dirname+'/test-helper');

var buffers = {};
buffers.readyForQuery = new BufferList()
  .add(Buffer('I'))
  .join(true,'Z');

module.exports = buffers;

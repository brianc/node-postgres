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

buffers.backendKeyData = function(processID, secretKey) {
  return new BufferList()
    .addInt32(processID)
    .addInt32(secretKey)
    .join(true, 'K');
};

buffers.commandComplete = function(string) {
  return new BufferList()
    .addCString(string)
    .join(true, 'C');
};

buffers.rowDescription = function(fields) {
  fields = fields || [];
  var buf = new BufferList();
  buf.addInt16(fields.length);
  fields.forEach(function(field) {
    buf.addCString(field.name)
      .addInt32(field.tableID || 0)
      .addInt16(field.attributeNumber || 0)
      .addInt32(field.dataTypeID || 0)
      .addInt16(field.dataTypeSize || 0)
      .addInt32(field.typeModifier || 0)
      .addInt16(field.formatCode || 0)
  });
  return buf.join(true, 'T');
};

buffers.dataRow = function(columns) {
  columns = columns || [];
  var buf = new BufferList();
  buf.addInt16(columns.length);
  columns.forEach(function(col) {
    if(col == null) {
      buf.writeInt32(-1);
    } else {
      var strBuf = new Buffer(col, 'utf8');
      buf.addInt32(strBuf.length);
      buf.add(strBuf);
    }
  });
  return buf.join(true, 'D');
};

buffers.error = function(fields) {
  fields = fields || [];
  var buf = new BufferList();
  fields.forEach(function(field) {
    buf.addChar(field.type);
    buf.addCString(field.value);
  });
  buf.add(Buffer([0]));//terminator
  return buf.join(true, 'E');
};



module.exports = buffers;

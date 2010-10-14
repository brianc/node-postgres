var Parser = function() { };

var p = Parser.prototype;

p.setBuffer = function(buffer) {
  if(this.lastBuffer) {    //we have unfinished biznaz
    //need to combine last two buffers
    var remaining = this.lastBuffer.length - this.lastOffset;
    var combinedBuffer = new Buffer(buffer.length + remaining);
    this.lastBuffer.copy(combinedBuffer, 0, this.lastOffset);
    this.lastBuffer = false;
    buffer.copy(combinedBuffer, remaining, 0);
    this.buffer = combinedBuffer;
    this.offset = 0;
    return;
  }
  this.buffer = buffer;
  this.offset = 0;
};

p.parseMessage =  function() {
  if(this.buffer.length == this.offset) {
    //clean packet - nothing left for next buffer
    return false;
  }
  var remaining = this.buffer.length - this.offset - 1;
  var messageID = this.buffer[this.offset];
  var length = this.peekInt32(this.offset + 1);
  if(remaining < 5 || remaining < length) {
    this.lastBuffer = this.buffer;
    this.lastOffset = this.offset;
    return false;
  }

  return this["parse"+messageID]();
};

//parse 'R' message
p.parse82 = function() {
  var type = this.buffer[this.offset++];
  var length = this.parseLength();
  if(length == 8) {
    this.offset += 4;
    return {
      name: 'authenticationOk',
      id: 'R',
      length: length
    }
  }
  throw new Error("Unknown AuthenticatinOk message type");
};

//parse 'S' message
p.parse83 = function(buffer) {
  var msg = this.parseStart('parameterStatus');
  msg.parameterName = this.parseCString();
  msg.parameterValue = this.parseCString();
  return msg;
};

//parse 'K' message
p.parse75 = function() {
  var msg = this.parseStart('backendKeyData');
  msg.processID = this.parseInt32();
  msg.secretKey = this.parseInt32();
  return msg;
};

//parse 'C' message
p.parse67 = function() {
  var msg = this.parseStart('commandComplete');
  msg.text = this.parseCString();
  return msg;
};

//parses common start of message packets
p.parseStart = function(name) {
  return {
    name: name,
    id: this.readChar(),
    length: this.parseInt32()
  }
};

p.readChar = function() {
  return Buffer([this.buffer[this.offset++]]).toString('utf8');
};

//parse 'Z' message
p.parse90 = function() {
  var msg = this.parseStart('readyForQuery');
  msg.status = this.readChar();
  return msg;
};

//parse 'T' message
p.parse84 = function() {
  var msg = this.parseStart('rowDescription');
  msg.fieldCount = this.parseInt16();
  var fields = [];
  for(var i = 0; i < msg.fieldCount; i++){
    fields[i] = this.parseField();
  }
  msg.fields = fields;
  return msg;
};

p.parseField = function() {
  var row = {
    name: this.parseCString(),
    tableID: this.parseInt32(),
    columnID: this.parseInt16(),
    dataType: this.parseInt32(),
    dataTypeSize: this.parseInt16(),
    dataTypeModifier: this.parseInt32(),
    format: this.parseInt16() == 0 ? 'text' : 'binary'
  };
  return row;
};

//parse 'D' message
p.parse68 = function() {
  var msg = this.parseStart('dataRow');
  var fieldCount = this.parseInt16();
  var fields = [];
  for(var i = 0; i < fieldCount; i++) {
    var length = this.parseInt32();
    fields[i] = (length == -1 ? null : this.readString(length))
  };
  msg.fieldCount = fieldCount;
  msg.fields = fields;
  return msg;
};

//parse 'E' message
p.parse69 = function() {
  var msg = this.parseStart('error');
  var fields = {};
  var fieldType = this.readString(1);
  while(fieldType != '\0') {
    fields[fieldType] = this.parseCString();
    fieldType = this.readString(1);
  }
  msg.severity = fields.S;
  msg.code = fields.C;
  msg.message = fields.M;
  msg.detail = fields.D;
  msg.hint = fields.H;
  msg.position = fields.P;
  msg.internalPosition = fields.p;
  msg.internalQuery = fields.q;
  msg.where = fields.W;
  msg.file = fields.F;
  msg.line = fields.L;
  msg.routine = fields.R;
  return msg;
};


p.parseInt32 = function() {
  var value = this.peekInt32();
  this.offset += 4;
  return value;
};

p.peekInt32 = function(offset) {
  offset = offset || this.offset;
  var buffer = this.buffer;
  return ((buffer[offset++] << 24) +
          (buffer[offset++] << 16) +
          (buffer[offset++] << 8) +
          buffer[offset++]);
};


p.parseInt16 = function() {
  return ((this.buffer[this.offset++] << 8) + (this.buffer[this.offset++] << 0));
};

p.parseLength =  function() {
  return this.parseInt32();
};

p.readString = function(length) {
  return this.buffer.toString('utf8', this.offset, (this.offset += length));
};

p.parseCString = function() {
  var start = this.offset;
  while(this.buffer[this.offset++]) { };
  return this.buffer.toString('utf8',start, this.offset - 1);
};

module.exports = Parser;

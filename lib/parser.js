var Parser = function(buffer) {
  this.offset = 0;
  this.buffer = buffer;
};

var p = Parser.prototype;

p.parseMessage =  function() {
  if(this.buffer.length == this.offset) {
    return false;
  }
  var messageID = this.buffer[this.offset];
  return this["parse"+messageID]();
};

//parse 'R' message
p.parse82 = function() {
  var type = this.buffer[this.offset++];
  var length = this.parseLength();
  if(length == 8) {
    this.offset += 4;
    return {
      name: 'AuthenticationOk',
      id: 'R',
      length: length
    }
  }
  throw new Error("Unknown AuthenticatinOk message type");
};

//parse 'S' message
p.parse83 = function(buffer) {
  var msg = this.parseStart('ParameterStatus');
  msg.parameterName = this.parseCString();
  msg.parameterValue = this.parseCString();
  return msg;
};

//parse 'K' message
p.parse75 = function() {
  var msg = this.parseStart('BackendKeyData');
  msg.processID = this.readInt32();
  msg.secretKey = this.readInt32();
  return msg;
};

//parse 'C' message
p.parse67 = function() {
  var msg = this.parseStart('CommandComplete');
  msg.text = this.parseCString();
  return msg;
};

//parses common start of message packets
p.parseStart = function(name) {
  return {
    name: name,
    id: this.readChar(),
    length: this.readInt32()
  }
};

p.readChar = function() {
  return Buffer([this.buffer[this.offset++]]).toString('utf8');
};

//parse 'Z' message
p.parse90 = function() {
  var msg = this.parseStart('ReadyForQuery');
  msg.status = this.readChar();
  return msg;
};

//parse 'T' message
p.parse84 = function() {
  var msg = this.parseStart('RowDescription');
  msg.fieldCount = this.readInt16();
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
    tableID: this.readInt32(),
    columnID: this.readInt16(),
    dataType: this.readInt32(),
    dataTypeSize: this.readInt16(),
    dataTypeModifier: this.readInt32(),
    format: this.readInt16() == 0 ? 'text' : 'binary'
  };
  return row;
};

//parse 'D' message
p.parse68 = function() {
  var msg = this.parseStart('DataRow');
  var fieldCount = this.readInt16();
  var fields = [];
  for(var i = 0; i < fieldCount; i++) {
    fields[i] = this.readString(this.readInt32());
  };
  msg.fieldCount = fieldCount;
  msg.fields = fields;
  return msg;
};

//parse 'E' message
p.parse69 = function() {
  var msg = this.parseStart('Error');
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


p.readInt32 = function() {
  var buffer = this.buffer;
  return ((buffer[this.offset++] << 24) +
          (buffer[this.offset++] << 16) +
          (buffer[this.offset++] << 8) +
          buffer[this.offset++]);
};

p.readInt16 = function() {
  return ((this.buffer[this.offset++] << 8) + (this.buffer[this.offset++] << 0));
};

p.parseLength =  function() {
  return this.readInt32();
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

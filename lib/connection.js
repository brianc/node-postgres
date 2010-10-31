var sys = require('sys');
var net = require('net');
var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;

var utils = require(__dirname + '/utils');
var BufferList = require(__dirname + '/buffer-list');

var Connection = function(config) {
  EventEmitter.call(this);
  config = config || {};
  this.stream = config.stream || new net.Stream();
  this.lastBuffer = false;
  this.lastOffset = 0;
  this.buffer = null;
  this.offset = null;
  this.encoding = 'utf8';
  this.parsedStatements = {};
};

sys.inherits(Connection, EventEmitter);

var p = Connection.prototype;

p.connect = function(port, host) {

  if(this.stream.readyState === 'closed'){
    this.stream.connect(port, host);
  }
  else if(this.stream.readyState == 'open') {
    this.emit('connect');
  }

  var self = this;

  this.stream.on('connect', function() {
    self.emit('connect');
  });


  this.stream.on('data', function(buffer) {
    self.setBuffer(buffer);
    var msg;
    while(msg = self.parseMessage()) {
      self.emit('message', msg);
      self.emit(msg.name, msg);
    }
  });

  this.stream.on('error', function(error) {
    self.emit('error', error);
  });
};

p.startup = function(config) {
  var buffer = new BufferList()
    .addInt16(3)
    .addInt16(0)
    .addCString('user')
    .addCString(config.user)
    .addCString('database')
    .addCString(config.database)
    .addCString('');
  this.send(false, buffer.join());
};

p.password = function(password) {
  this.send('p', Buffer(password + '\0', this.encoding));
};

p.send = function(code, bodyBuffer) {
  var length = bodyBuffer.length + 4;
  var buffer = Buffer(length + (code ? 1 : 0));
  var offset = 0;
  if(code) {
    buffer[offset++] = Buffer(code, this.encoding) [0];
  }
  this.writeInt32(buffer, offset, length);
  bodyBuffer.copy(buffer, offset+4, 0);
  return this.stream.write(buffer);
};

p.writeInt32 = function(buffer, offset, value) {
  buffer[offset++] = value >>> 24 & 0xFF;
  buffer[offset++] = value >>> 16 & 0xFF;
  buffer[offset++] = value >>> 8 & 0xFF;
  buffer[offset++] = value >>> 0 & 0xFF;
};

p.end = function() {
  var terminationBuffer = new Buffer([0x58,0,0,0,4]);
  var wrote = this.stream.write(terminationBuffer);
};

p.query = function(text) {
  this.send('Q', new Buffer(text + '\0', this.encoding));
};

p.parse = function(query) {
  //expect something like this:
  // { name: 'queryName',
  //   text: 'select * from blah',
  //   types: ['int8', 'bool'] }

  //normalize missing query names to allow for null
  query.name = query.name || '';
  //normalize null type array
  query.types = query.types || [];
  var len = query.types.length;
  var buffer = new BufferList()
    .addCString(query.name) //name of query
    .addCString(query.text) //actual query text
    .addInt16(len);
  for(var i = 0; i < len; i++) {
    buffer.addInt32(query.types[i]);
  }

  this.send('P', buffer.join());

  return this;
};

p.bind = function(config) {
  //normalize config
  config = config || {};
  config.portal = config.portal || '';
  config.statement = config.statement || '';
  var values = config.values || [];
  var len = values.length;
  var buffer = new BufferList()
    .addCString(config.portal)
    .addCString(config.statement)
    .addInt16(0) //always use default text format
    .addInt16(len); //number of parameters
  for(var i = 0; i < len; i++) {
    var val = values[i];
    if(val === null) {
      buffer.addInt32(-1);
    } else {
      val = val.toString();
      buffer.addInt32(Buffer.byteLength(val));
      buffer.add(Buffer(val,this.encoding));
    }
  }
  buffer.addInt16(0); //no format codes, use text
  this.send('B', buffer.join());
};

p.execute = function(config) {
  config = config || {};
  config.portal = config.portal || '';
  config.rows = config.rows || '';
  var buffer = new BufferList()
    .addCString(config.portal)
    .addInt32(config.rows)
    .join();
  this.send('E', buffer);
};

p.flush = function() {
  this.send('H',Buffer(0));
}

p.sync = function() {
  this.send('S', Buffer(0));
};

p.end = function() {
  this.send('X', Buffer(0));
};

p.describe = function(msg) {
  var str = msg.type + (msg.name || "" ) + '\0';
  var buffer = Buffer(str, this.encoding);
  this.send('D', buffer);
};

//parsing methods
p.setBuffer = function(buffer) {
  if(this.lastBuffer) {    //we have unfinished biznaz
    //need to combine last two buffers
    var remaining = this.lastBuffer.length - this.lastOffset;
    var combinedBuffer = new Buffer(buffer.length + remaining);
    this.lastBuffer.copy(combinedBuffer, 0, this.lastOffset);
    buffer.copy(combinedBuffer, remaining, 0);
    buffer = combinedBuffer;
  }
  this.buffer = buffer;
  this.offset = 0;
};

var messageNames = {
  R: 'authenticationOk',
  S: 'parameterStatus',
  K: 'backendKeyData',
  C: 'commandComplete',
  Z: 'readyForQuery',
  T: 'rowDescription',
  D: 'dataRow',
  E: 'error',
  N: 'notice',
  1: 'parseComplete',
  2: 'bindComplete',
  A: 'notification',
  n: 'noData',
  I: 'emptyQuery'
};

p.parseMessage =  function() {
  var remaining = this.buffer.length - (this.offset);
  if(remaining < 5) {
    //cannot read id + length without at least 5 bytes
    //just abort the read now
    this.lastBuffer = this.buffer;
    this.lastOffset = this.offset;
    return;
  }

  var id = this.readChar();

  var message = {
    name: messageNames[id],
    length: this.parseInt32()
  };

  if(remaining <= message.length) {
    this.lastBuffer = this.buffer;
    //rewind the last 5 bytes we read
    this.lastOffset = this.offset-5;
    return false;
  }
  
  return this["parse"+id](message);
};

p.parseR = function(msg) {
  var code = 0;
  if(msg.length === 8) {
    code = this.parseInt32();
    if(code === 3) {
      msg.name = 'authenticationCleartextPassword';
    }
    return msg;
  }
  if(msg.length === 12) {
    code = this.parseInt32();
    if(code === 5) { //md5 required
      msg.name = 'authenticationMD5Password';
      msg.salt = new Buffer(4);
      this.buffer.copy(msg.salt, 0, this.offset, this.offset + 4);
      this.offset += 4;
      return msg;
    }
  }
  throw new Error("Unknown authenticatinOk message type" + sys.inspect(msg));
};

p.parseS = function(msg) {
  msg.parameterName = this.parseCString();
  msg.parameterValue = this.parseCString();
  return msg;
};

p.parseK = function(msg) {
  msg.processID = this.parseInt32();
  msg.secretKey = this.parseInt32();
  return msg;
};

p.parseC = function(msg) {
  msg.text = this.parseCString();
  return msg;
};

p.parseZ = function(msg) {
  msg.status = this.readChar();
  return msg;
};

p.parseT = function(msg) {
  msg.fieldCount = this.parseInt16();
  var fields = [];
  for(var i = 0; i < msg.fieldCount; i++){
    fields[i] = this.parseField();
  }
  msg.fields = fields;
  return msg;
};

p.parseField = function() {
  var field = {
    name: this.parseCString(),
    tableID: this.parseInt32(),
    columnID: this.parseInt16(),
    dataTypeID: this.parseInt32(),
    dataTypeSize: this.parseInt16(),
    dataTypeModifier: this.parseInt32(),
    format: this.parseInt16() === 0 ? 'text' : 'binary'
  };
  return field;
};

p.parseD = function(msg) {
  var fieldCount = this.parseInt16();
  var fields = [];
  for(var i = 0; i < fieldCount; i++) {
    var length = this.parseInt32();
    fields[i] = (length === -1 ? null : this.readString(length))
  };
  msg.fieldCount = fieldCount;
  msg.fields = fields;
  return msg;
};

//parses error
p.parseE = function(msg) {
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

//same thing, different name
p.parseN = p.parseE;

//some messages are only a header portion and
//require no more parsing
var noParse = function(msg) { return msg; };

//parses parseComplete
p.parse1 = noParse;

//parses bindComplete
p.parse2 = noParse;

//parse emptyQuery
p.parseI = noParse;

p.parseA = function(msg) {
  msg.processId = this.parseInt32();
  msg.channel = this.parseCString();
  msg.payload = this.parseCString();
  return msg;
};

p.parsen = function(msg) {
  return msg;
};

p.readChar = function() {
  return Buffer([this.buffer[this.offset++]]).toString(this.encoding);
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
  return ((this.buffer[this.offset++] << 8) +
          (this.buffer[this.offset++] << 0));
};

p.readString = function(length) {
  return this.buffer.toString(this.encoding, this.offset, (this.offset += length));
};

p.parseCString = function() {
  var start = this.offset;
  while(this.buffer[this.offset++]) { };
  return this.buffer.toString(this.encoding, start, this.offset - 1);
};
//end parsing methods
module.exports = Connection;

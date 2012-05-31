var net = require('net');
var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var utils = require(__dirname + '/utils');
var Writer = require(__dirname + '/writer');

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
  this.writer = new Writer();
};

util.inherits(Connection, EventEmitter);

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
  var bodyBuffer = this.writer
    .addInt16(3)
    .addInt16(0)
    .addCString('user')
    .addCString(config.user)
    .addCString('database')
    .addCString(config.database)
    .addCString('').flush();
  //this message is sent without a code

  var length = bodyBuffer.length + 4;

  var buffer = new Writer()
    .addInt32(length)
    .add(bodyBuffer)
    .join();
  this.stream.write(buffer);
};

p.cancel = function(processID, secretKey) {
  var bodyBuffer = this.writer
    .addInt16(1234)
    .addInt16(5678)
    .addInt32(processID)
    .addInt32(secretKey)
    .addCString('').flush();

  var length = bodyBuffer.length + 4;

  var buffer = new Writer()
    .addInt32(length)
    .add(bodyBuffer)
    .join();
  this.stream.write(buffer);
};

p.password = function(password) {
  //0x70 = 'p'
  this._send(0x70, this.writer.addCString(password));
};

p._send = function(code, more) {
  if(!this.stream.writable) return false;
  if(more === true) {
    this.writer.addHeader(code);
  } else {
    return this.stream.write(this.writer.flush(code));
  }
}

p.query = function(text) {
  //0x51 = Q
  this.stream.write(this.writer.addCString(text).flush(0x51));
};

//send parse message
//"more" === true to buffer the message until flush() is called
p.parse = function(query, more) {
  //expect something like this:
  // { name: 'queryName',
  //   text: 'select * from blah',
  //   types: ['int8', 'bool'] }

  //normalize missing query names to allow for null
  query.name = query.name || '';
  //normalize null type array
  query.types = query.types || [];
  var len = query.types.length;
  var buffer = this.writer
    .addCString(query.name) //name of query
    .addCString(query.text) //actual query text
    .addInt16(len);
  for(var i = 0; i < len; i++) {
    buffer.addInt32(query.types[i]);
  }

  var code = 0x50;
  this._send(code, more);
};

//send bind message
//"more" === true to buffer the message until flush() is called
p.bind = function(config, more) {
  //normalize config
  config = config || {};
  config.portal = config.portal || '';
  config.statement = config.statement || '';
  config.binary = config.binary || false;
  var values = config.values || [];
  var len = values.length;
  var buffer = this.writer
    .addCString(config.portal)
    .addCString(config.statement)
    .addInt16(0) //always use default text format
    .addInt16(len); //number of parameters
  for(var i = 0; i < len; i++) {
    var val = values[i];
    if(val === null || typeof val === "undefined") {
      buffer.addInt32(-1);
    } else {
      val = val.toString();
      buffer.addInt32(Buffer.byteLength(val));
      buffer.addString(val);
    }
  }

  if (config.binary) {
    buffer.addInt16(1); // format codes to use binary
    buffer.addInt16(1);
  }
  else {
    buffer.addInt16(0); // format codes to use text
  }
  //0x42 = 'B'
  this._send(0x42, more);
};

//send execute message
//"more" === true to buffer the message until flush() is called
p.execute = function(config, more) {
  config = config || {};
  config.portal = config.portal || '';
  config.rows = config.rows || '';
  var buffer = this.writer
    .addCString(config.portal)
    .addInt32(config.rows);

  //0x45 = 'E'
  this._send(0x45, more);
};

var emptyBuffer = Buffer(0);

p.flush = function() {
  //0x48 = 'H'
  this.writer.add(emptyBuffer)
  this._send(0x48);
}

p.sync = function() {
  //clear out any pending data in the writer
  this.writer.flush(0)
  
  this.writer.add(emptyBuffer);
  this._send(0x53);
};

p.end = function() {
  //0x58 = 'X'
  this.writer.add(emptyBuffer);
  this._send(0x58);
};

p.describe = function(msg, more) {
  this.writer.addCString(msg.type + (msg.name || ''));
  this._send(0x44, more);
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

p.parseMessage =  function() {
  var remaining = this.buffer.length - (this.offset);
  if(remaining < 5) {
    //cannot read id + length without at least 5 bytes
    //just abort the read now
    this.lastBuffer = this.buffer;
    this.lastOffset = this.offset;
    return false;
  }

  //read message id code
  var id = this.buffer[this.offset++];
  //read message length
  var length = this.parseInt32();

  if(remaining <= length) {
    this.lastBuffer = this.buffer;
    //rewind the last 5 bytes we read
    this.lastOffset = this.offset-5;
    return false;
  }

  var msg = {
    length: length
  };

  switch(id)
  {

  case 0x52: //R
    msg.name = 'authenticationOk';
    return this.parseR(msg);

  case 0x53: //S
    msg.name = 'parameterStatus';
    return this.parseS(msg);

  case 0x4b: //K
    msg.name = 'backendKeyData';
    return this.parseK(msg);

  case 0x43: //C
    msg.name = 'commandComplete';
    return this.parseC(msg);

  case 0x5a: //Z
    msg.name = 'readyForQuery';
    return this.parseZ(msg);

  case 0x54: //T
    msg.name = 'rowDescription';
    return this.parseT(msg);

  case 0x44: //D
    msg.name = 'dataRow';
    return this.parseD(msg);

  case 0x45: //E
    msg.name = 'error';
    return this.parseE(msg);

  case 0x4e: //N
    msg.name = 'notice';
    return this.parseN(msg);

  case 0x31: //1
    msg.name = 'parseComplete';
    return msg;

  case 0x32: //2
    msg.name = 'bindComplete';
    return msg;

  case 0x41: //A
    msg.name = 'notification';
    return this.parseA(msg);

  case 0x6e: //n
    msg.name = 'noData';
    return msg;

  case 0x49: //I
    msg.name = 'emptyQuery';
    return msg;

  case 0x73: //s
    msg.name = 'portalSuspended';
    return msg;

  default:
    throw new Error("Unrecognized message code " + id);
  }
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
  throw new Error("Unknown authenticatinOk message type" + util.inspect(msg));
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
    fields[i] = (length === -1 ? null : this.readBytes(length))
  };
  msg.fieldCount = fieldCount;
  msg.fields = fields;
  return msg;
};

//parses error
p.parseE = function(input) {
  var fields = {};
  var msg, item;
  var fieldType = this.readString(1);
  while(fieldType != '\0') {
    fields[fieldType] = this.parseCString();
    fieldType = this.readString(1);
  }
  if (input.name === 'error') {
    // the msg is an Error instance
    msg = new Error(fields.M);
    for (item in input) {
      // copy input properties to the error
      if (input.hasOwnProperty(item)) {
        msg[item] = input[item];
      }
    }
  } else {
    // the msg is an object literal
    msg = input;
    msg.message = fields.M;
  }
  msg.severity = fields.S;
  msg.code = fields.C;
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

p.parseA = function(msg) {
  msg.processId = this.parseInt32();
  msg.channel = this.parseCString();
  msg.payload = this.parseCString();
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

p.readBytes = function(length) {
  return this.buffer.slice(this.offset, this.offset += length);
};

p.parseCString = function() {
  var start = this.offset;
  while(this.buffer[this.offset++]) { };
  return this.buffer.toString(this.encoding, start, this.offset - 1);
};
//end parsing methods
module.exports = Connection;

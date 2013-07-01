var net = require('net');
var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var utils = require(__dirname + '/utils');
var Writer = require('buffer-writer');

var TEXT_MODE = 0;
var BINARY_MODE = 1;
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
  this.ssl = config.ssl || false;
  this._ending = false;
  this._mode = TEXT_MODE;
};

util.inherits(Connection, EventEmitter);

Connection.prototype.connect = function(port, host) {

  if(this.stream.readyState === 'closed') {
    this.stream.connect(port, host);
  } else if(this.stream.readyState == 'open') {
    this.emit('connect');
  }

  var self = this;

  this.stream.on('connect', function() {
    self.emit('connect');
  });

  this.stream.on('error', function(error) {
    //don't raise ECONNRESET errors - they can & should be ignored 
    //during disconnect
    if(self._ending && error.code == 'ECONNRESET') {
      return;
    }
    self.emit('error', error);
  });

  this.stream.on('end', function() {
    self.emit('end');
  });

  if(!this.ssl) {
    return this.attachListeners(this.stream);
  }

  this.stream.once('data', function(buffer) {
    var responseCode = buffer.toString('utf8');
    if(responseCode != 'S') {
      return self.emit('error', new Error('The server does not support SSL connections'));
    }
    var tls = require('tls');
    self.stream = tls.connect({
      socket: self.stream,
      servername: host,
      rejectUnauthorized: self.ssl.rejectUnauthorized,
      ca: self.ssl.ca,
      pfx: self.ssl.pfx,
      key: self.ssl.key,
      passphrase: self.ssl.passphrase,
      cert: self.ssl.cert,
      NPNProtocols: self.ssl.NPNProtocols
    });
    self.attachListeners(self.stream);
    self.emit('sslconnect');
  });
};

Connection.prototype.attachListeners = function(stream) {
  var self = this;
  stream.on('data', function(buffer) {
    self.setBuffer(buffer);
    var msg = self.parseMessage();
    while(msg) {
      self.emit('message', msg);
      self.emit(msg.name, msg);
      msg = self.parseMessage();
    }
  });
};

Connection.prototype.requestSsl = function(config) {
  this.checkSslResponse = true;

  var bodyBuffer = this.writer
    .addInt16(0x04D2)
    .addInt16(0x162F).flush();

  var length = bodyBuffer.length + 4;

  var buffer = new Writer()
    .addInt32(length)
    .add(bodyBuffer)
    .join();
  this.stream.write(buffer);
};

Connection.prototype.startup = function(config) {
  var bodyBuffer = this.writer
    .addInt16(3)
    .addInt16(0)
    .addCString('user')
    .addCString(config.user)
    .addCString('database')
    .addCString(config.database)
    .addCString('client_encoding')
    .addCString("'utf-8'")
    .addCString('').flush();
  //this message is sent without a code

  var length = bodyBuffer.length + 4;

  var buffer = new Writer()
    .addInt32(length)
    .add(bodyBuffer)
    .join();
  this.stream.write(buffer);
};

Connection.prototype.cancel = function(processID, secretKey) {
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

Connection.prototype.password = function(password) {
  //0x70 = 'p'
  this._send(0x70, this.writer.addCString(password));
};

Connection.prototype._send = function(code, more) {
  if(!this.stream.writable) { return false; }
  if(more === true) {
    this.writer.addHeader(code);
  } else {
    return this.stream.write(this.writer.flush(code));
  }
};

Connection.prototype.query = function(text) {
  //0x51 = Q
  this.stream.write(this.writer.addCString(text).flush(0x51));
};

//send parse message
//"more" === true to buffer the message until flush() is called
Connection.prototype.parse = function(query, more) {
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
Connection.prototype.bind = function(config, more) {
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
      buffer.addInt32(Buffer.byteLength(val));
      buffer.addString(val);
    }
  }

  if(config.binary) {
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
Connection.prototype.execute = function(config, more) {
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

Connection.prototype.flush = function() {
  //0x48 = 'H'
  this.writer.add(emptyBuffer);
  this._send(0x48);
};

Connection.prototype.sync = function() {
  //clear out any pending data in the writer
  this.writer.flush(0);

  this.writer.add(emptyBuffer);
  this._send(0x53);
};

Connection.prototype.end = function() {
  //0x58 = 'X'
  this.writer.add(emptyBuffer);
  this._send(0x58);
  this._ending = true;
};

Connection.prototype.describe = function(msg, more) {
  this.writer.addCString(msg.type + (msg.name || ''));
  this._send(0x44, more);
};

Connection.prototype.sendCopyFromChunk = function (chunk) {
  this.stream.write(this.writer.add(chunk).flush(0x64));
};

Connection.prototype.endCopyFrom = function () {
  this.stream.write(this.writer.add(emptyBuffer).flush(0x63));
};

Connection.prototype.sendCopyFail = function (msg) {
  //this.stream.write(this.writer.add(emptyBuffer).flush(0x66));
  this.writer.addCString(msg);
  this._send(0x66);
};

//parsing methods
Connection.prototype.setBuffer = function(buffer) {
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

Connection.prototype.readSslResponse = function() {
  var remaining = this.buffer.length - (this.offset);
  if(remaining < 1) {
    this.lastBuffer = this.buffer;
    this.lastOffset = this.offset;
    return false;
  }
  return {
    name: 'sslresponse',
    text: this.buffer[this.offset++]
  };
};

Connection.prototype.parseMessage =  function() {
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

  case 0x47: //G
    msg.name = 'copyInResponse';
    return this.parseGH(msg);

  case 0x48: //H
    msg.name = 'copyOutResponse';
    return this.parseGH(msg);
  case 0x63: //c
    msg.name = 'copyDone';
    return  msg;

  case 0x64: //d
    msg.name = 'copyData';
    return this.parsed(msg);

  default:
    throw new Error("Unrecognized message code " + id);
  }
};

Connection.prototype.parseR = function(msg) {
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

Connection.prototype.parseS = function(msg) {
  msg.parameterName = this.parseCString();
  msg.parameterValue = this.parseCString();
  return msg;
};

Connection.prototype.parseK = function(msg) {
  msg.processID = this.parseInt32();
  msg.secretKey = this.parseInt32();
  return msg;
};

Connection.prototype.parseC = function(msg) {
  msg.text = this.parseCString();
  return msg;
};

Connection.prototype.parseZ = function(msg) {
  msg.status = this.readChar();
  return msg;
};

Connection.prototype.parseT = function(msg) {
  msg.fieldCount = this.parseInt16();
  var fields = [];
  for(var i = 0; i < msg.fieldCount; i++){
    fields.push(this.parseField());
  }
  msg.fields = fields;
  return msg;
};

Connection.prototype.parseField = function() {
  var field = {
    name: this.parseCString(),
    tableID: this.parseInt32(),
    columnID: this.parseInt16(),
    dataTypeID: this.parseInt32(),
    dataTypeSize: this.parseInt16(),
    dataTypeModifier: this.parseInt32(),
    format: undefined
  };
  if(this.parseInt16() === TEXT_MODE) {
    this._mode = TEXT_MODE;
    field.format = 'text';
  } else {
    this._mode = BINARY_MODE;
    field.format = 'binary';
  }
  return field;
};

Connection.prototype.parseD = function(msg) {
  var fieldCount = this.parseInt16();
  var fields = [];
  for(var i = 0; i < fieldCount; i++) {
    var length = this.parseInt32();
    var value = null;
    if(length !== -1) {
      if(this._mode === TEXT_MODE) {
        value = this.readString(length);
      } else {
        value = this.readBytes(length);
      }
    }
    fields.push(value);
  }
  msg.fieldCount = fieldCount;
  msg.fields = fields;
  return msg;
};

//parses error
Connection.prototype.parseE = function(input) {
  var fields = {};
  var msg, item;
  var fieldType = this.readString(1);
  while(fieldType != '\0') {
    fields[fieldType] = this.parseCString();
    fieldType = this.readString(1);
  }
  if(input.name === 'error') {
    // the msg is an Error instance
    msg = new Error(fields.M);
    for (item in input) {
      // copy input properties to the error
      if(input.hasOwnProperty(item)) {
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
Connection.prototype.parseN = Connection.prototype.parseE;

Connection.prototype.parseA = function(msg) {
  msg.processId = this.parseInt32();
  msg.channel = this.parseCString();
  msg.payload = this.parseCString();
  return msg;
};

Connection.prototype.parseGH = function (msg) {
  var isBinary = this.buffer[this.offset] !== 0;
  this.offset++;
  msg.binary = isBinary;
  var columnCount = this.parseInt16();
  msg.columnTypes = [];
  for(var i = 0; i<columnCount; i++) {
    msg.columnTypes.push(this.parseInt16());
  }
  return msg;
};

Connection.prototype.readChar = function() {
  return this.readString(1);
};

Connection.prototype.parseInt32 = function() {
  var value = this.buffer.readInt32BE(this.offset, true);
  this.offset += 4;
  return value;
};

Connection.prototype.parseInt16 = function() {
  var value = this.buffer.readInt16BE(this.offset, true);
  this.offset += 2;
  return value;
};

Connection.prototype.readString = function(length) {
  return this.buffer.toString(this.encoding, this.offset, (this.offset += length));
};

Connection.prototype.readBytes = function(length) {
  return this.buffer.slice(this.offset, this.offset += length);
};

Connection.prototype.parseCString = function() {
  var start = this.offset;
  while(this.buffer[this.offset++] !== 0) { }
  return this.buffer.toString(this.encoding, start, this.offset - 1);
};

Connection.prototype.parsed = function (msg) {
  //exclude length field
  msg.chunk = this.readBytes(msg.length - 4);
  return msg;
};
//end parsing methods
module.exports = Connection;

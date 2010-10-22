var EventEmitter = require('events').EventEmitter;
var net = require('net');
var Query = require(__dirname+'/query');
var sys = require('sys');
var crypto = require('crypto');

var Client = function(config) {
  EventEmitter.call(this);
  config = config || {};
  this.user = config.user;
  this.database = config.database;
  this.port = config.port || 5432;
  this.host = config.host;
  this.queryQueue = [];
  this.stream = config.stream || new net.Stream();
  this.queryQueue = [];
  this.password = config.password || '';
  this.lastBuffer = false;
  this.lastOffset = 0;
  this.buffer = null;
  this.offset = null;
  this.encoding = 'utf8';
};

sys.inherits(Client, EventEmitter);

var p = Client.prototype;

p.connect = function() {
  if(this.stream.readyState == 'closed'){
    this.stream.connect(this.port, this.host);
  }
  var self = this;
  this.stream.on('connect', function() {
    var data = ['user',self.user,'database', self.database, '\0'].join('\0');
    var dataBuffer = Buffer(data, self.encoding);
    var fullBuffer = Buffer(4 + dataBuffer.length);
    self.writeInt32(fullBuffer, 0, 0x03);//write protocol version
    dataBuffer.copy(fullBuffer, 4, 0);
    self.send(null, fullBuffer);
  });

  this.stream.on('data', function(buffer) {
    self.setBuffer(buffer);
    var msg;
    while(msg = self.parseMessage()) {
      self.emit('message', msg);
      self.emit(msg.name, msg);
    }
  });

  this.on('authenticationCleartextPassword', function() {
    self.send('p', new Buffer(self.password + '\0', self.encoding));
  });

  this.on('authenticationMD5Password', function(msg) {
    var enc = function(string) {
      return crypto.createHash('md5').update(string).digest('hex');
    }
    var md5password = "md5" + enc(enc(self.password + self.user) + msg.salt.toString('binary')) + "\0";
    self.send('p', new Buffer(md5password, self.encoding));
  });

  this.on('readyForQuery', function() {
    self.readyForQuery = true;
    self.pulseQueryQueue();
  });
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

p.disconnect = function() {
  var terminationBuffer = new Buffer([88,0,0,0,4]);
  this.stream.write(terminationBuffer);
};

p.query = function(text) {
  var query = new Query();
  query.text = text;
  this.queryQueue.push(query);
  this.pulseQueryQueue();
  return query;
};

p.pulseQueryQueue = function(ready) {
  if(!this.readyForQuery) {
    return;
  };
  var query = this.queryQueue.shift();
  if(query) {
    var self = this;
    this.readyForQuery = false;
    this.stream.write(query.toBuffer());
    var rowHandler = function(msg) {
      query.processDataRow(msg);
    };
    var descriptionHandler = function(fields) {
      query.processRowDescription(fields);
    };
    this.on('rowDescription',descriptionHandler);
    var endHandler;
    endHandler = function(msg) {
      query.emit('end');
      self.removeListener('rowDescription', descriptionHandler);
      self.removeListener('commandComplete', endHandler);
      self.removeListener('dataRow', rowHandler);
    };
    this.on('dataRow', rowHandler);
    this.on('commandComplete', endHandler);
  }
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
  E: 'error'
};

p.parseMessage =  function() {
  var remaining = this.buffer.length - this.offset - 1;
  if(remaining < 5) {
    //cannot read id + length without at least 5 bytes
    //just abort the read now
    this.lastBuffer = this.buffer;
    this.lastOffset = this.offset;
    return;
  }

  var id = this.readChar();

  var message = {
    id: id,
    name: messageNames[id],
    length: this.parseInt32()
  };

  if(remaining < message.length) {
    this.lastBuffer = this.buffer;
    //rewind the last 5 bytes we read
    this.lastOffset = this.offset-5;
    return false;
  }

  return this["parse"+message.id](message);
};

p.parseR = function(msg) {
  var code = 0;
  if(msg.length == 8) {
    code = this.parseInt32();
    if(code == 3) {
      msg.name = 'authenticationCleartextPassword';
    }
    return msg;
  }
  if(msg.length == 12) {
    code = this.parseInt32();
    if(code == 5) { //md5 required
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
    format: this.parseInt16() == 0 ? 'text' : 'binary'
  };
  return field;
};

p.parseD = function(msg) {
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
module.exports = Client;

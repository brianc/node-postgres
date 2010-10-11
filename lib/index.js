var EventEmitter = require('events').EventEmitter;
var sys = require('sys');
var net = require('net');

var NUL = '\0';
var chars = ['R','S','K','Z','Q','C','T','D','X','E'];
var charBuff = Buffer(chars.join(''),'utf8');
var UTF8 = {};
for(var i = 0; i < charBuff.length; i++){
  var char = chars[i];
  UTF8[char] = charBuff[i];
};

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
};

sys.inherits(Client, EventEmitter);

Client.prototype.connect = function() {
  if(this.stream.readyState == 'closed'){
    this.stream.connect(this.port, this.host);
  }
  var self = this;
  this.stream.on('connect', function() {
    var data = ['user',self.user,'database', self.database,NUL].join(NUL);
    var dataBuffer = Buffer(data);
    var fullBuffer = Buffer(8 + dataBuffer.length);
    fullBuffer[0] = fullBuffer.length >>> 24;
    fullBuffer[1] = fullBuffer.length >>> 16;
    fullBuffer[2] = fullBuffer.length >>> 8;
    fullBuffer[3] = fullBuffer.length >>> 0;
    fullBuffer[4] = 0;
    fullBuffer[5] = 3;
    fullBuffer[6] = 0;
    fullBuffer[7] = 0;
    fullBuffer.write(data,8);
    self.stream.write(fullBuffer);
  });

  this.stream.on('data', function(data) {
    var parser = new Parser(data);
    var msg = parser.parseMessage();
    while(msg) {
      self.emit('message', msg);
      self.emit(msg.name, msg);
      msg = parser.parseMessage();
    }
  });

  this.on('ReadyForQuery', function() {
    self.readyForQuery = true;
    self.pulseQueryQueue();
  });
};

Client.prototype.disconnect = function() {
  var terminationBuffer = new Buffer([UTF8.X,0,0,0,4]);
  this.stream.write(terminationBuffer);
};

Client.prototype.query = function(text) {
  var query = new Query();
  query.client = this;
  query.text = text;
  this.queryQueue.push(query);
  this.pulseQueryQueue();
  return query;
};

Client.prototype.pulseQueryQueue = function() {
  if(!this.readyForQuery) {
    return;
  };
  var query = this.queryQueue.shift();
  if(query) {
    var self = this;
    this.readyForQuery = false;
    this.stream.write(query.toBuffer());
    var rowHandler = function(msg) {
      query.emit('row',msg.fields)
    };
    var endHandler;
    endHandler = function(msg) {
      query.emit('end');
      self.removeListener('CommandComplete', endHandler);
      self.removeListener('DataRow', rowHandler);
    };
    this.on('DataRow', rowHandler);
    this.on('CommandComplete', endHandler);
  }
};

var Query = function() {
  EventEmitter.call(this);
};

sys.inherits(Query, EventEmitter);

Query.prototype.toBuffer = function() {
  var textBuffer = new Buffer(this.text+'\0','utf8');
  var len = textBuffer.length + 4;
  var fullBuffer = new Buffer(len + 1);
  fullBuffer[0] = 0x51;
  fullBuffer[1] = len >>> 24;
  fullBuffer[2] = len >>> 16;
  fullBuffer[3] = len >>> 8;
  fullBuffer[4] = len >>> 0;
  textBuffer.copy(fullBuffer,5,0);
  return fullBuffer;
};

var Parser = function(buffer) {
  this.offset = 0;
  this.buffer = buffer;
};

var p = Parser.prototype;

p.parse = function() {
  var messages = [];
  var message = this.parseMessage();
  while(message) {
    messages.push(message);
    message = this.parseMessage();
  }
  return messages;
};

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
  }p
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

module.exports = {
  Client: Client,
  Parser: Parser
};

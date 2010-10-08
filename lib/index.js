var EventEmitter = require('events').EventEmitter;
var sys = require('sys');
var net = require('net');

var NUL = '\0';
var chars = ['R','S','K','Z','Q','C','T','D','X'];
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
  var con = this.stream;
  if(con.readyState == 'closed'){
    con.connect(this.port, this.host);
  }
  var self = this;
  con.on('connect', function() {
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
    con.write(fullBuffer);
  });
  con.on('data', function(data) {
    var parser = new Parser(data);
    var result = parser.parse();
    result.forEach(function(msg) {
      self.emit('message', msg);
      self.emit(msg.name, msg);
    });
  });
  this.con = con;
};

Client.prototype.disconnect = function() {
  var terminationBuffer = new Buffer([UTF8.X,0,0,0,4]);
  this.con.write(terminationBuffer);
};

Client.prototype.query = function() {
  var query = new Query();
  query.client = this;
  this.queryQueue.push(this);
  return query;
};

var Query = function() {
  EventEmitter.call(this);
  var self = this;
  process.nextTick(function() {
    self.emit('end');
  });
};
sys.inherits(Query, EventEmitter);


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
  switch(messageID) {
  case UTF8.R:
    return this.parseR();
  case UTF8.S:
    return this.parseS();
  case UTF8.K:
    return this.parseK();
  case UTF8.Z:
    return this.parseZ();
  case UTF8.C:
    return this.parseC();
  case UTF8.T:
    return this.parseT();
  case UTF8.D:
    return this.parseD();
  default:
    throw new Error("Unsupported message ID: " + Buffer([messageID]).toString('utf8') + " (" + messageID.toString(16) + ")");
  }
};

p.parseR = function() {
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

p.parseS = function(buffer) {
  var msg = this.parseStart('ParameterStatus');
  msg.parameterName = this.parseCString();
  msg.parameterValue = this.parseCString();
  return msg;
};

p.parseK = function() {
  var msg = this.parseStart('BackendKeyData');
  msg.processID = this.readInt32();
  msg.secretKey = this.readInt32();
  return msg;
};

p.parseC = function() {
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

p.parseZ = function() {
  var msg = this.parseStart('ReadyForQuery');
  msg.status = this.readChar();
  return msg;
};

p.parseT = function() {
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

p.parseD = function() {
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

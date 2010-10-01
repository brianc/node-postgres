var EventEmitter = require('events').EventEmitter;
var sys = require('sys');
var net = require('net');
var NUL = '\0';

var chars = Buffer('RSKZQCTD','utf8');
var UTF8 = {
  R: chars[0],
  S: chars[1],
  K: chars[2],
  Z: chars[3],
  Q: chars[4],
  C: chars[5],
  T: chars[6],
  D: chars[7]
};


var Client = function(config) {
  EventEmitter.call(this);
  config = config || {};
  this.user = config.user;
  this.database = config.database;
  this.port = config.port || 5432;
  this.queryQueue = [];
};
sys.inherits(Client, EventEmitter);

Client.prototype.connect = function() {
  var con = net.createConnection(this.port);
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
  this.on('ReadyForQuery', function() {
    self.readyForQuery = true;
    self.pulseQueryQueue();
  });
  this.on('message', function(msg) {
    console.log(msg.name);
  });
};

Client.prototype.query = function(queryText) {
  this.queryQueue.push(new Query({
    text: queryText
  }));
  this.pulseQueryQueue();
};

Client.prototype.pulseQueryQueue = function() {
  if(!this.readyForQuery) {
    return;
  }
  var query = this.queryQueue.shift();
  if(!query) {
    return;
  }
  var txt = query.text + "\0"
  var queryTextBuffer = Buffer(txt);
  var len = queryTextBuffer.length+4;
  var messageBuffer = Buffer(queryTextBuffer.length + 5);
  messageBuffer[0] = UTF8.Q;
  messageBuffer[1] = len >>> 24;
  messageBuffer[2] = len >>> 16;
  messageBuffer[3] = len >>> 8;
  messageBuffer[4] = len >>> 0;
  messageBuffer.write(txt,5);
  this.con.write(messageBuffer);
  this.readyForQuery = false;
};

var Query = function(config) {
  this.text = config.text;
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
  msg.fieldCount = this.readInt16();
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

p.parseCString = function(buffer) {
  var start = this.offset;
  while(this.buffer[this.offset++]) { };
  return this.buffer.toString('utf8',start, this.offset - 1);
};


module.exports = {
  Client: Client,
  Parser: Parser
};

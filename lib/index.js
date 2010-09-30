var EventEmitter = require('events').EventEmitter;
var sys = require('sys');
var net = require('net');
var NUL = '\0';

var chars = Buffer('RSKZ','utf8');
var UTF8 = {
  R: chars[0],
  S: chars[1],
  K: chars[2],
  Z: chars[3]
};


var Client = function(config) {
  EventEmitter.call(this);
  config = config || {};
  this.user = config.user;
  this.database = config.database;
  this.port = config.port || 5432;
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
    console.log(fullBuffer);
    con.write(fullBuffer);
  });
  con.on('data', function(data) {
    console.log('data!');
    console.log(data);
    var parser = new Parser(data);
    con.end();
    var result = parser.parse();
    result.forEach(function(msg) {
      console.log(msg);
    });
  });
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

p.readInt32 = function() {
  var buffer = this.buffer;
  return ((buffer[this.offset++] << 24) +
          (buffer[this.offset++] << 16) +
          (buffer[this.offset++] << 8) +
          buffer[this.offset++]);
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

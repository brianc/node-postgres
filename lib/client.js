var EventEmitter = require('events').EventEmitter;
var net = require('net');
var Query = require(__dirname+'/query');
var Parser = require(__dirname+'/parser');
var sys = require('sys');

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
    var dataBuffer = Buffer(data,'utf8');
    var fullBuffer = Buffer(4 + dataBuffer.length);
    fullBuffer[0] = 0;
    fullBuffer[1] = 3;
    fullBuffer[2] = 0;
    fullBuffer[3] = 0;
    dataBuffer.copy(fullBuffer, 4, 0);
    self.send(null, fullBuffer);
  });
  var parser = new Parser();
  this.stream.on('data', function(buffer) {
    parser.setBuffer(buffer);
    var msg = parser.parseMessage();
    while(msg) {
      self.emit('message', msg);
      self.emit(msg.name, msg);
      msg = parser.parseMessage();
    }
  });

  this.on('authenticationCleartextPassword', function() {
    var stringBuffer = new Buffer(self.password + '\0', 'utf8');
    self.send('p', stringBuffer);
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
    buffer[offset++] = Buffer(code,'utf8') [0];
  }
  buffer[offset++] = length >>> 24 & 0xFF;
  buffer[offset++] = length >>> 16 & 0xFF;
  buffer[offset++] = length >>> 8 & 0xFF;
  buffer[offset++] = length >>> 0 & 0xFF;
  bodyBuffer.copy(buffer, offset, 0);
  return this.stream.write(buffer);
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

p.pulseQueryQueue = function() {
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

module.exports = Client;

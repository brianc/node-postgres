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

  this.on('readyForQuery', function() {
    self.readyForQuery = true;
    self.pulseQueryQueue();
  });
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
      query.emit('row',msg.fields)
    };
    var endHandler;
    endHandler = function(msg) {
      query.emit('end');
      self.removeListener('commandComplete', endHandler);
      self.removeListener('dataRow', rowHandler);
    };
    this.on('dataRow', rowHandler);
    this.on('commandComplete', endHandler);
  }
};

module.exports = Client;

var helper = require(__dirname+'/../test-helper');
var EventEmitter = require('events').EventEmitter;
var Connection = require(__dirname + '/../../lib/connection');
MemoryStream = function() {
  EventEmitter.call(this);
  this.packets = [];
};


helper.sys.inherits(MemoryStream, EventEmitter);

var p = MemoryStream.prototype;

p.write = function(packet) {
  this.packets.push(packet);
};

p.setKeepAlive = function(){};

p.writable = true;

createClient = function(config) {
  var stream = new MemoryStream();
  stream.readyState = "open";
  var connection = new Connection({stream: stream});
  config = config || {};
  if (typeof(config) === 'object')
    config.connection = connection;
  var client = new Client(config);
  client.connection = connection;
  client.connect();
  client.connection.emit('connect');
  return client;
};

module.exports = helper;

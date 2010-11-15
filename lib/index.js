var EventEmitter = require('events').EventEmitter;
var sys = require('sys');
var net = require('net');

var Client = require(__dirname+'/client');

var connect = function(config, callback) {
  var client = new Client(config);
  client.connect();
  var onError = function() {
    
  };
  client.once('error', onError);
  client.connection.once('readyForQuery', function() {
    callback
  });
};

module.exports = {
  Client: Client
  Connection: require(__dirname + '/connection'),
  connect: connect
};

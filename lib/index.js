var EventEmitter = require('events').EventEmitter;
var sys = require('sys');
var net = require('net');

var Client = require(__dirname+'/client');

//wrap up common connection management boilerplate
var connect = function(config, callback) {
  var client = new Client(config);
  client.connect();

  var onError = function(error) {
    client.connection.removeListener('readyForQuery', onReady);
    callback(error);
  }

  var onReady = function() {
    client.removeListener('error', onError);
    callback(null, client);
    client.on('drain', client.end.bind(client));
  }

  client.once('error', onError);

  //TODO refactor
  //i don't like reaching into the client's connection for attaching
  //to specific events here
  client.connection.once('readyForQuery', onReady);
}

module.exports = {
  Client: Client,
  Connection: require(__dirname + '/connection'),
  connect: connect,
  defaults: require(__dirname + '/defaults')
}

var EventEmitter = require('events').EventEmitter;
var sys = require('sys');
var net = require('net');

module.exports = {
  Client: require(__dirname+'/client'),
  Connection: require(__dirname + '/connection')
};

var EventEmitter = require('events').EventEmitter;
var Client = require(__dirname+'/client');
var defaults =  require(__dirname + '/defaults');
var pool = require(__dirname + "/client-pool").init(Client);
module.exports = {
  Client: Client,
  Connection: require(__dirname + '/connection'),
  connect: pool.connect,
  end: pool.end,
  defaults: defaults
}

var Client = require('./client');
var util = require('util');
var Pool = require('pg-pool');
var parse = require('pg-connection-string').parse;

module.exports = function(Client) {

  var BoundPool = function(options) {
    // Handle connection string based pool creation
    options = typeof options == 'string' ? parse(options) : (options || {});
    var config = { Client: Client };
    for (var key in options) {
      config[key] = options[key];
    }
    Pool.call(this, config);
  };

  util.inherits(BoundPool, Pool);

  return BoundPool;
};

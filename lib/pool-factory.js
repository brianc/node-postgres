var Client = require('./client');
var ConnectionParameters = require('./connection-parameters');
var util = require('util');
var Pool = require('pg-pool');

module.exports = function(Client) {

  var BoundPool = function(options) {
    var config = new ConnectionParameters(options);
    config.Client = Client;
    for (var key in options) {
      config[key] = options[key];
    }
    Pool.call(this, config);
  };

  util.inherits(BoundPool, Pool);

  return BoundPool;
};

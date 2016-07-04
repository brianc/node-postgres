var Client = require('./client');
var ConnectionParameters = require('./connection-parameters');
var util = require('util');
var Pool = require('pg-pool');

module.exports = function(Client) {

  var BoundPool = function(options) {
    var config = new ConnectionParameters(options);
    config.Client = Client;
    Pool.call(this, config);
  };

  util.inherits(BoundPool, Pool);

  return BoundPool;
};

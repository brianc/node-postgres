var helper = require(__dirname+'/../test-helper');
var Connection = require(__dirname + '/../../../lib/connection');
var makeClient = function(config) {
  var connection = new Connection({stream: "no"});
  connection.startup = function() {};
  connection.connect = function() {};
  connection.query = function(text) {
    this.queries.push(text);
  };
  connection.queries = [];
  config = config || {};
  if (typeof(config) === 'object')
    config.connection = connection;
  var client = new Client(config);
  client.connection = connection;
  client.connect();
  client.connection.emit('connect');
  return client;
};

module.exports = {
  client: makeClient
};

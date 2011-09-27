var helper = require(__dirname+'/../test-helper');
var Connection = require(__dirname + '/../../../lib/connection');
var makeClient = function() {
  var connection = new Connection({stream: "no"});
  connection.startup = function() {};
  connection.connect = function() {};
  connection.query = function(text) {
    this.queries.push(text);
  };
  connection.queries = [];
  var client = new Client({connection: connection});
  client.connect();
  client.connection.emit('connect');
  return client;
};

module.exports = {
  client: makeClient
};

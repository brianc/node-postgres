Client = require(__dirname+'/../../lib/client');
sys = require('sys');

//creates a configured, connecting client
var client = function() {
  var client = new Client({
    database: 'postgres',
    user: 'brian'
  });
  client.connect();
  return client;
};

module.exports = {
  client: client
};

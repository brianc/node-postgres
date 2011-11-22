var helper = require(__dirname+'/../test-helper');

//creates a client from cli parameters
helper.client = function() {
  var client = new Client(helper.config);
  client.connect();
  return client;
};

module.exports = helper;

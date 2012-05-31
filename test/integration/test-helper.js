var helper = require(__dirname + '/../test-helper');

if(helper.args.native) {
  Client = require(__dirname + '/../../lib/native');
  helper.Client = Client;
  helper.pg = helper.pg.native;
}

//creates a client from cli parameters
helper.client = function() {
  var client = new Client(helper.config);
  client.connect();
  return client;
};

//export parent helper stuffs
module.exports = helper;


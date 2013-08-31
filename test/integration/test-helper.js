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

var semver = require('semver');
helper.versionGTE = function(client, versionString, callback) {
  client.query('SELECT version()', assert.calls(function(err, result) {
    if(err) return callback(err);
    var version = result.rows[0].version.split(' ')[1];
    return callback(null, semver.gte(version, versionString));
  }));
};

//export parent helper stuffs
module.exports = helper;


var helper = require(__dirname+'/../test-helper');

module.exports = {
  //creates a client from cli parameters
  client: function() {
    var client = new Client({
      database: helper.args.database,
      user: helper.args.user,
      password: helper.args.password
    });
    client.connect();
    return client;
  }
};

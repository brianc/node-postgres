var helper = require(__dirname+'/../test-helper');

module.exports = {
  //creates a client from cli parameters
  client: function() {
    var client = new Client({
      database: helper.args.database,
      user: helper.args.user,
      password: helper.args.password,
      host: helper.args.host,
      port: helper.args.port
    });
    
    client.connect();
    return client;
  },
  connectionString: helper.connectionString,
  Sink: helper.Sink,
  pg: helper.pg,
  args: helper.args
};

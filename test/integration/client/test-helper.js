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
    client.on('error', function(e, d) {
      console.log(e);
    });
    var rawQuery = client.query;
    client.query = function() {
      var q = rawQuery.apply(this, arguments);
      q.on('error', function(e) {
        console.log(e);
      });
      return q;
    };
    client.connect();
    return client;
  },
  connectionString: helper.connectionString,
  Sink: helper.Sink,
  pg: helper.pg
};

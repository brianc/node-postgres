var helper = require(__dirname+'/../test-helper');

module.exports = {
  //creates a client from cli parameters
  client: function() {
    return new Client({
      database: helper.args.database,
      user: helper.args.user,
      password: helper.args.password
    });
  }
};

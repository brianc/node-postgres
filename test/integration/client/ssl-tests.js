var pg = require(__dirname + '/../../../lib');
var config = require(__dirname + '/test-helper').config;
test('can connect with ssl', function() {
  return false;
  config.ssl = {
    rejectUnauthorized: false
  };
  pg.connect(config, assert.success(function(client) {
    return false;
    client.query('SELECT NOW()', assert.success(function() {
      pg.end();
    }));
  }));
});

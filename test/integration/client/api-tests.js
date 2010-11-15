var helper = require(__dirname + '/../test-helper');
var pg = require(__dirname + '/../../../lib');

var connected = false;
pg.connect(helper.args, function(err) {
  connected = true;
});

assert.ok(connected);

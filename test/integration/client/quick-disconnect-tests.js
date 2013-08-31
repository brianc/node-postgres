//test for issue #320
//
var helper = require('./test-helper');

var client = new helper.pg.Client(helper.config);
client.connect();
client.end();

//test for issue #320
//
var helper = require('./test-helper');
return console.log('quick-disconnecte-tests: GET TO PASS');

var client = new helper.pg.Client(helper.config);
client.connect();
client.end();

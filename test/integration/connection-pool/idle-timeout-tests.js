var helper = require('./test-helper');
var _ = require('lodash')

const config = _.extend({ }, helper.config, { idleTimeoutMillis: 50 })

test('idle timeout', function() {
 helper.pg.connect(config, assert.calls(function(err, client, done) {
   assert.isNull(err);
   client.query('SELECT NOW()');
  //just let this one time out
  //test will hang if pool doesn't timeout
   done();
 }));
});

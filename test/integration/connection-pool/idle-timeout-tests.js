var helper = require(__dirname + '/test-helper');

helper.pg.defaults.poolIdleTimeout = 200;

test('idle timeout', function() {
 helper.pg.connect(helper.config, assert.calls(function(err, client) {
   assert.isNull(err);
   client.query('SELECT NOW()');
  //just let this one time out 
  //test will hang if pool doesn't timeout
 }));
});

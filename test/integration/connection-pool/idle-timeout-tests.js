var helper = require(__dirname + '/test-helper');

const config = Object.assign({ }, helper.config, { idleTimeoutMillis: 50 })

test('idle timeout', function() {
 helper.pg.connect(config, assert.calls(function(err, client, done) {
   assert.isNull(err);
   client.query('SELECT NOW()');
  //just let this one time out
  //test will hang if pool doesn't timeout
   done();
 }));
});

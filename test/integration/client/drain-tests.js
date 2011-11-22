var helper = require(__dirname + '/test-helper');
var pg = require(__dirname + '/../../../lib');

if(helper.args.native) {
  pg = require(__dirname + '/../../../lib').native;
}

var testDrainOfClientWithPendingQueries = function() {
  pg.connect(helper.config, assert.success(function(client) {
    test('when there are pending queries and client is resumed', function() {
      var drainCount = 0;
      client.on('drain', function() {
        drainCount++;
      });
      client.pauseDrain();
      client.query('SELECT NOW()', function() {
        client.query('SELECT NOW()', function() {
          assert.equal(drainCount, 0);
          process.nextTick(function() {
            assert.equal(drainCount, 1);
            pg.end();
          });
        });
        client.resumeDrain();
        assert.equal(drainCount, 0);
      });
    });
  }));
};

pg.connect(helper.config, assert.success(function(client) {
  var drainCount = 0;
  client.on('drain', function() {
    drainCount++;
  });
  test('pauseDrain and resumeDrain on simple client', function() {
    client.pauseDrain();
    client.resumeDrain();
    process.nextTick(assert.calls(function() {
      assert.equal(drainCount, 0);
      test('drain is paused', function() {
        client.pauseDrain();
        client.query('SELECT NOW()', assert.success(function() {
          process.nextTick(function() {
            assert.equal(drainCount, 0);
            client.resumeDrain();
            assert.equal(drainCount, 1);
            testDrainOfClientWithPendingQueries();
          });
        }));
      });
    }));
  });
}));


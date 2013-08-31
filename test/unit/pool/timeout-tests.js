var util = require('util');
var EventEmitter = require('events').EventEmitter;

var libDir = __dirname + '/../../../lib';
var defaults = require(libDir + '/defaults');
var pools = require(libDir + '/pool');
var poolId = 0;

require(__dirname + '/../../test-helper');

var FakeClient = function() {
  EventEmitter.call(this);
}

util.inherits(FakeClient, EventEmitter);

FakeClient.prototype.connect = function(cb) {
  process.nextTick(cb);
}

FakeClient.prototype.end = function() {
  this.endCalled = true;
}

defaults.poolIdleTimeout = 10;
defaults.reapIntervalMillis = 10;

test('client times out from idle', function() {
  pools.Client = FakeClient;
  var p = pools.getOrCreate(poolId++);
  p.connect(function(err, client, done) {
    done();
  });
  process.nextTick(function() {
    assert.equal(p.availableObjectsCount(), 1);
    assert.equal(p.getPoolSize(), 1);
    setTimeout(function() {
      assert.equal(p.availableObjectsCount(), 0);
      assert.equal(p.getPoolSize(), 0);
    }, 50);
  });
});

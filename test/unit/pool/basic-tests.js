var util = require('util');
var EventEmitter = require('events').EventEmitter;

var libDir = __dirname + '/../../../lib';
var defaults = require(libDir + '/defaults');
var pool = require(libDir + '/pool');
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
  
}

//Hangs the event loop until 'end' is called on client
var HangingClient = function(config) {
  EventEmitter.call(this);
  this.config = config;
}

util.inherits(HangingClient, EventEmitter);

HangingClient.prototype.connect = function(cb) {
  this.intervalId = setInterval(function() {
    console.log('hung client...');
  }, 1000);
  process.nextTick(cb);
}

HangingClient.prototype.end = function() {
  clearInterval(this.intervalId);
}

pool.Client = FakeClient;

test('no pools exist', function() {
  assert.empty(Object.keys(pool.all));
});

test('pool creates pool on miss', function() {
  var p = pool();
  assert.ok(p);
  assert.equal(Object.keys(pool.all).length, 1);
  var p2 = pool();
  assert.equal(p, p2);
  assert.equal(Object.keys(pool.all).length, 1);
  var p3 = pool("pg://postgres:password@localhost:5432/postgres");
  assert.notEqual(p, p3);
  assert.equal(Object.keys(pool.all).length, 2);
});

test('pool follows default limits', function() {
  var p = pool(poolId++);
  for(var i = 0; i < 100; i++) {
    p.acquire(function(err, client) {
    });
  }
  assert.equal(p.getPoolSize(), defaults.poolSize);
});

test('pool#connect with 2 parameters (legacy, for backwards compat)', function() {
  var p = pool(poolId++);
  p.connect(assert.success(function(client) {
    assert.ok(client);
    assert.equal(p.availableObjectsCount(), 0);
    assert.equal(p.getPoolSize(), 1);
    client.emit('drain');
    assert.equal(p.availableObjectsCount(), 1);
    assert.equal(p.getPoolSize(), 1);
    p.destroyAllNow();
  }));
});

test('pool#connect with 3 parameters', function() {
  var p = pool(poolId++);
  var tid = setTimeout(function() {
    throw new Error("Connection callback was never called");
  }, 100);
  p.connect(function(err, client, done) {
    clearTimeout(tid);
    assert.equal(err, null);
    assert.ok(client);
    assert.equal(p.availableObjectsCount(), 0);
    assert.equal(p.getPoolSize(), 1);
    client.emit('drain');
    assert.equal(p.availableObjectsCount(), 0);
    assert.equal(p.getPoolSize(), 1);
    done();
    assert.equal(p.availableObjectsCount(), 1);
    assert.equal(p.getPoolSize(), 1);
    p.destroyAllNow();
  });
});

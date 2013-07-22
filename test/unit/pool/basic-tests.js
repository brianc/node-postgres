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

pools.Client = FakeClient;

test('no pools exist', function() {
  assert.empty(Object.keys(pools.all));
});

test('pool creates pool on miss', function() {
  var p = pools.getOrCreate();
  assert.ok(p);
  assert.equal(Object.keys(pools.all).length, 1);
  var p2 = pools.getOrCreate();
  assert.equal(p, p2);
  assert.equal(Object.keys(pools.all).length, 1);
  var p3 = pools.getOrCreate("postgres://postgres:password@localhost:5432/postgres");
  assert.notEqual(p, p3);
  assert.equal(Object.keys(pools.all).length, 2);
});

test('pool follows defaults', function() {
  var p = pools.getOrCreate(poolId++);
  for(var i = 0; i < 100; i++) {
    p.acquire(function(err, client) {
    });
  }
  assert.equal(p.getPoolSize(), defaults.poolSize);
});

test('pool#connect with 3 parameters', function() {
  var p = pools.getOrCreate(poolId++);
  var tid = setTimeout(function() {
    throw new Error("Connection callback was never called");
  }, 100);
  p.connect(function(err, client, done) {
    clearTimeout(tid);
    assert.ifError(err, null);
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

test('on client error, client is removed from pool', function() {
  var p = pools.getOrCreate(poolId++);
  p.connect(assert.success(function(client, done) {
    assert.ok(client);
    done();
    assert.equal(p.availableObjectsCount(), 1);
    assert.equal(p.getPoolSize(), 1);
    //error event fires on pool BEFORE pool.destroy is called with client
    assert.emits(p, 'error', function(err) {
      assert.equal(err.message, 'test error');
      assert.ok(!client.endCalled);
      assert.equal(p.availableObjectsCount(), 1);
      assert.equal(p.getPoolSize(), 1);
      //after we're done in our callback, pool.destroy is called
      process.nextTick(function() {
        assert.ok(client.endCalled);
        assert.equal(p.availableObjectsCount(), 0);
        assert.equal(p.getPoolSize(), 0);
        p.destroyAllNow();
      });
    });
    client.emit('error', new Error('test error'));
  }));
});

test('pool with connection error on connection', function() {
  pools.Client = function() {
    return {
      connect: function(cb) {
        process.nextTick(function() {
          cb(new Error('Could not connect'));
        });
      }
    };
  }
  test('two parameters', function() {
    var p = pools.getOrCreate(poolId++);
    p.connect(assert.calls(function(err, client) {
      assert.ok(err);
      assert.equal(client, null);
      //client automatically removed
      assert.equal(p.availableObjectsCount(), 0);
      assert.equal(p.getPoolSize(), 0);
    }));
  });
  test('three parameters', function() {
    var p = pools.getOrCreate(poolId++);
    var tid = setTimeout(function() {
      assert.fail('Did not call connect callback');
    }, 100);
    p.connect(function(err, client, done) {
      clearTimeout(tid);
      assert.ok(err);
      assert.equal(client, null);
      //done does nothing
      done(new Error('OH NOOOO'));
      done();
      assert.equal(p.availableObjectsCount(), 0);
      assert.equal(p.getPoolSize(), 0);
    });
  });
});

test('returnning an error to done()', function() {
  var p = pools.getOrCreate(poolId++);
  pools.Client = FakeClient;
  p.connect(function(err, client, done) {
    assert.equal(err, null);
    assert(client);
    done(new Error("BROKEN"));
    assert.equal(p.availableObjectsCount(), 0);
    assert.equal(p.getPoolSize(), 0);
  });
});

test('fetching pool by object', function() {
  var p = pools.getOrCreate({
    user: 'brian',
    host: 'localhost',
    password: 'password'
  });
  var p2 = pools.getOrCreate({
    user: 'brian',
    host: 'localhost',
    password: 'password'
  });
  assert.equal(p, p2);
});

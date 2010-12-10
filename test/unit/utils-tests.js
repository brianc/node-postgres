require(__dirname + '/test-helper');
var Pool = require("utils").Pool;

//this tests the monkey patching
//to ensure comptability with older
//versions of node
test("EventEmitter.once", function() {

  //an event emitter
  var stream = new MemoryStream();

  var callCount = 0;
  stream.once('single', function() {
    callCount++;
  });

  stream.emit('single');
  stream.emit('single');
  assert.equal(callCount, 1);
});

test('an empty pool', function() {
  test('with no creation method', function() {
    var pool = new Pool(10);
    var brian = {name:'brian'};

    test('can set and get an item', function() {
      pool.checkIn(brian);
      var sync = pool.checkOut(assert.calls(function(err, item) {
        assert.equal(brian, item)
        assert.same(brian, item)
      }))
      assert.ok(sync, "should have fired sync")
    })

    test('checkout blocks until item checked back in', function() {
      var called = false;
      var sync = pool.checkOut(assert.calls(function(err, item) {
        called = true;
        assert.equal(brian, item)
        assert.same(brian, item)
      }))
      assert.ok(sync === false, "Should not have fired sync")
      assert.ok(called === false, "Should not have fired callback yet")
      pool.checkIn(brian)
    })

  })

  test('with a creation method', function() {
    var customName = "first";
    var callCount = 0;
    var pool = new Pool(3, function() {
      return {name: customName + (++callCount)};
    });

    test('creates if pool is not at max size', function() {
      var sync = pool.checkOut(assert.calls(function(err, item) {
        assert.equal(item.name, "first1");
      }))
      assert.ok(sync, "Should have generated item & called callback in sync")
    })
    
    test('creates again if item is checked out', function() {
      var sync = pool.checkOut(assert.calls(function(err, item) {
        assert.equal(item.name, "first2")
      }))
      assert.ok(sync, "Should have called in sync again")
    })
    var external = {name: 'boom'};
    test('can add another item', function() {
      pool.checkIn(external)
      var sync = pool.checkOut(assert.calls(function(err, item) {
        assert.equal(item.name, 'boom')
      }))
      assert.ok(sync, "Should have fired 3rd in sync")
    })

    test('after pool is full, create is not called again', function() {
      var called = false;
      var sync = pool.checkOut(assert.calls(function(err, item) {
        called = true;
        assert.equal(item.name, 'boom')
      }))
      assert.ok(sync === false, "should not be sync")
      assert.ok(called === false, "should not have called callback")
      pool.checkIn(external);
    })
  })

})


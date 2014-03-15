require(__dirname + '/test-helper');
var utils = require(__dirname + "/../../lib/utils");
var defaults = require(__dirname + "/../../lib").defaults;


test('ensure types is exported on root object', function() {
  var pg = require('../../lib')
  assert(pg.types)
  assert(pg.types.getTypeParser)
  assert(pg.types.setTypeParser)
})

//this tests the monkey patching
//to ensure comptability with older
//versions of node
test("EventEmitter.once", function(t) {

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


test('normalizing query configs', function() {
  var config
  var callback = function () {}

  config = utils.normalizeQueryConfig({text: 'TEXT'})
  assert.same(config, {text: 'TEXT'})

  config = utils.normalizeQueryConfig({text: 'TEXT'}, [10])
  assert.deepEqual(config, {text: 'TEXT', values: [10]})

  config = utils.normalizeQueryConfig({text: 'TEXT', values: [10]})
  assert.deepEqual(config, {text: 'TEXT', values: [10]})

  config = utils.normalizeQueryConfig('TEXT', [10], callback)
  assert.deepEqual(config, {text: 'TEXT', values: [10], callback: callback})

  config = utils.normalizeQueryConfig({text: 'TEXT', values: [10]}, callback)
  assert.deepEqual(config, {text: 'TEXT', values: [10], callback: callback})
})

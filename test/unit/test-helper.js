sys = require('sys');
assert = require('assert');
Client = require(__dirname+'/../../lib/client');
EventEmitter = require('events').EventEmitter;
BufferList = require(__dirname+'/buffer-list');
buffers = require(__dirname+'/test-buffers');


assert.same = function(actual, expected) {
  for(var key in expected) {
    assert.equal(actual[key], expected[key]);
  }
};

assert.equalBuffers = function(actual, expected) {
  if(actual.length != expected.length) {
    console.log(actual);
    console.log(expected);
    assert.equal(actual.length, expected.length);
  }
  for(var i = 0; i < actual.length; i++) {
    if(actual[i] != expected[i]) {
      console.log(actual);
      console.log(expected);
    }
    assert.equal(actual[i],expected[i]);
  }
};

assert.empty = function(actual) {
  assert.length(actual, 0);
};

assert.length = function(actual, expectedLength) {
  assert.equal(actual.length, expectedLength);
};


if(!global.TEST_RESULTS) {
  global.TEST_RESULTS = {
    testCount: 0,
    assertCount: 0
  };
}

test = function(name, action) {
  for(var i = 0; i < test.tabout; i++) {
    name = ' ' + name;
  }
  test.tabout += 2;
  process.stdout.write('.');
  try{
    global.TEST_RESULTS.testCount++;
    action();
  }catch(e) {
    console.log('');
    console.log(name);
    throw e;
  }
  test.tabout -= 2;
};
test.tabout = 0;
var start = new Date();
process.on('exit', function() {
  console.log('');
  console.log('Ran ' + global.TEST_RESULTS.testCount + ' tests in ' + ((new Date() - start)/1000) + ' seconds');
});

stringToHex = function(string) {
  var b = Buffer(string,'utf8');
  var result = [];
  for(var i = 0; i < b.length; i++) {
    result.push(b[i]);
  }
  return result;
};

hexToString = function(hexArray) {
  return new Buffer(hexArray).toString('utf8');
}

MemoryStream = function() {
  EventEmitter.call(this);
  this.packets = [];
};

sys.inherits(MemoryStream, EventEmitter);

var p = MemoryStream.prototype;

p.write = function(packet) {
  this.packets.push(packet);
};

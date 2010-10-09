sys = require('sys');
assert = require('assert');
Client = require(__dirname+"/../lib/").Client;
Parser = require(__dirname+"/../lib/").Parser;
EventEmitter = require('events').EventEmitter;
BufferList = require(__dirname+'/buffer-list');

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

test = function(name, action) {
  for(var i = 0; i < test.tabout; i++) {
    name = ' ' + name;
  }
  test.tabout += 2;
  console.log(name);
  action();

  test.tabout -= 2;
};
test.tabout = 0;

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

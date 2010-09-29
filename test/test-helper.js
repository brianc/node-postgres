sys = require('sys');
assert = require('assert');
Client = require(__dirname+"/../lib/").Client;
Parser = require(__dirname+"/../lib/").Parser;

assert.same = function(actual, expected) {
  for(var key in expected) {
    assert.equal(actual[key], expected[key]);
  }
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

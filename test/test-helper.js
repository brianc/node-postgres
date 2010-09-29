sys = require('sys');
assert = require('assert');
Client = require(__dirname+"/../lib/").Client;
Parser = require(__dirname+"/../lib/").Parser;

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

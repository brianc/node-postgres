var helper = require(__dirname + '/../test-helper');

//native bindings are only installed for native tests
if(!helper.args.native) {
  return;
}

var assert = require('assert')
var pg = require('../../../lib')
var native = require('../../../lib').native

var JsClient = require('../../../lib/client')
var NativeClient = require('../../../lib/native')

assert(pg.Client === JsClient);
assert(native.Client === NativeClient);

pg.connect(function(err, client, done) {
  assert(client instanceof JsClient);
  client.end();

  native.connect(function(err, client, done) {
    assert(client instanceof NativeClient);
    client.end();
  });
});


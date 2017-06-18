"use strict";
var helper = require('./../test-helper');

//native bindings are only installed for native tests
if (!helper.args.native) {
  return;
}

var assert = require('assert')
var pg = require('../../../lib')
var native = require('../../../lib').native

var JsClient = require('../../../lib/client')
var NativeClient = require('../../../lib/native')

assert(pg.Client === JsClient);
assert(native.Client === NativeClient);

const jsPool = new pg.Pool()
const nativePool = new native.Pool()

const suite = new helper.Suite()
suite.test('js pool returns js client', cb => {
  jsPool.connect(function (err, client, done) {
    assert(client instanceof JsClient);
    done()
    jsPool.end(cb)
  })

})

suite.test('native pool returns native client', cb => {
  nativePool.connect(function (err, client, done) {
    assert(client instanceof NativeClient);
    done()
    nativePool.end(cb)
  });
})

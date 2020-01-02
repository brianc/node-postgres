'use strict'
// this test assumes it has been run from the Makefile
// and that node_modules/pg-native has been deleted

var assert = require('assert')

assert.equal(require('../../lib').native, null)

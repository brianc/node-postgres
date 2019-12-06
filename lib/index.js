'use strict'
/**
 * Copyright (c) 2010-2017 Brian Carlson (brian.m.carlson@gmail.com)
 * All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * README.md file in the root directory of this source tree.
 */

var util = require('util')
var Client = require('./client')
var defaults = require('./defaults')
var Connection = require('./connection')
var Pool = require('pg-pool')

let hasNewTarget

try {
  // eslint-disable-next-line no-eval
  eval('(function () { new.target })')
  hasNewTarget = true
} catch (error) {
  hasNewTarget = false
}

const poolFactory = (Client) => {
  var BoundPool = function (options) {
    // new.target is a syntax error in Node 4
    // eslint-disable-next-line no-eval
    if (hasNewTarget && eval('new.target') === undefined) {
      // process.emitWarning is supported when new.target is supported
      // eslint-disable-next-line node/no-unsupported-features/node-builtins
      process.emitWarning('Constructing a pg.Pool without new is deprecated and will stop working in pg 8.', 'DeprecationWarning', 'PG-POOL-NEW')
    }

    var config = Object.assign({ Client: Client }, options)
    return new Pool(config)
  }

  util.inherits(BoundPool, Pool)

  return BoundPool
}

var PG = function (clientConstructor) {
  this.defaults = defaults
  this.Client = clientConstructor
  this.Query = this.Client.Query
  this.Pool = poolFactory(this.Client)
  this._pools = []
  this.Connection = Connection
  this.types = require('pg-types')
}

if (typeof process.env.NODE_PG_FORCE_NATIVE !== 'undefined') {
  module.exports = new PG(require('./native'))
} else {
  module.exports = new PG(Client)

  // lazy require native module...the native module may not have installed
  module.exports.__defineGetter__('native', function () {
    delete module.exports.native
    var native = null
    try {
      native = new PG(require('./native'))
    } catch (err) {
      if (err.code !== 'MODULE_NOT_FOUND') {
        throw err
      }
      /* eslint-disable no-console */
      console.error(err.message)
      /* eslint-enable no-console */
    }
    module.exports.native = native
    return native
  })
}

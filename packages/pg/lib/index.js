'use strict'

var Client = require('./client')
var defaults = require('./defaults')
var Connection = require('./connection')
var Pool = require('pg-pool')
const { DatabaseError } = require('pg-protocol')

const poolFactory = (Client) => {
  return class BoundPool extends Pool {
    constructor(options) {
      super(options, Client)
    }
  }
}

var PG = function (exports, clientConstructor) {
  exports.defaults = defaults
  exports.Client = clientConstructor
  exports.Query = exports.Client.Query
  exports.Pool = poolFactory(exports.Client)
  exports._pools = []
  exports.Connection = Connection
  exports.types = require('pg-types')
  exports.DatabaseError = DatabaseError
}

if (typeof process.env.NODE_PG_FORCE_NATIVE !== 'undefined') {
  PG(module.exports, require('./native'))
} else {
  PG(module.exports, Client)

  // lazy require native module...the native module may not have installed
  Object.defineProperty(module.exports, 'native', {
    configurable: true,
    enumerable: false,
    get() {
      var native = {}
      try {
        PG(native, require('./native'))
      } catch (err) {
        native = null
        if (err.code !== 'MODULE_NOT_FOUND') {
          throw err
        }
      }

      // overwrite module.exports.native so that getter is never called again
      Object.defineProperty(module.exports, 'native', {
        value: native,
      })

      return native
    },
  })
}

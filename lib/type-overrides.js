'use strict'
/**
 * Copyright (c) 2010-2017 Brian Carlson (brian.m.carlson@gmail.com)
 * All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * README.md file in the root directory of this source tree.
 */

var types = require('pg-types')

class TypeOverrides {
  constructor (userTypes) {
    this._types = userTypes || types
    this.text = {}
    this.binary = {}
  }

  getOverrides (format) {
    switch (format) {
      case 'text': return this.text
      case 'binary': return this.binary
      default: return {}
    }
  }

  setTypeParser (oid, format, parseFn) {
    if (typeof format === 'function') {
      parseFn = format
      format = 'text'
    }
    this.getOverrides(format)[oid] = parseFn
  }

  getTypeParser (oid, format) {
    format = format || 'text'
    return this.getOverrides(format)[oid] || this._types.getTypeParser(oid, format)
  }
}

module.exports = TypeOverrides

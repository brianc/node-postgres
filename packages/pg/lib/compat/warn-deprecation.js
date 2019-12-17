'use strict'

const util = require('util')

const dummyFunctions = new Map()

// Node 4 doesn’t support process.emitWarning(message, 'DeprecationWarning', code).
const emitDeprecationWarning = (message, code) => {
  let dummy = dummyFunctions.get(code)

  if (dummy === undefined) {
    dummy = util.deprecate(() => {}, message)
    dummyFunctions.set(code, dummy)
  }

  dummy()
}

module.exports = emitDeprecationWarning

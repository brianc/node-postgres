'use strict'

const warnDeprecation = require('./warn-deprecation')

// Node 4 doesn’t support new.target.
let hasNewTarget

try {
  // eslint-disable-next-line no-eval
  eval('(function () { new.target })')
  hasNewTarget = true
} catch (error) {
  hasNewTarget = false
}

const checkConstructor = (name, code, getNewTarget) => {
  if (hasNewTarget && getNewTarget() === undefined) {
    warnDeprecation(`Constructing a ${name} without new is deprecated and will stop working in pg 8.`, code)
  }
}

module.exports = checkConstructor

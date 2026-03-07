'use strict'

const noopChannel = { hasSubscribers: false }

let queryChannel = noopChannel
let connectionChannel = noopChannel

try {
  let dc
  if (typeof process.getBuiltInModule === 'function') {
    dc = process.getBuiltInModule('diagnostics_channel')
  } else {
    dc = require('diagnostics_channel')
  }
  if (typeof dc.tracingChannel === 'function') {
    queryChannel = dc.tracingChannel('pg:query')
    connectionChannel = dc.tracingChannel('pg:connection')
  }
} catch (e) {
  // diagnostics_channel not available (non-Node environment)
}

module.exports = { queryChannel, connectionChannel }

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

// Check explicitly for `false` rather than truthiness because the aggregated
// `hasSubscribers` getter on TracingChannel is `undefined` on Node 18 (which
// backported TracingChannel but not the getter). When `undefined`, we assume
// there may be subscribers and trace unconditionally.
function shouldTrace(channel) {
  return channel.hasSubscribers !== false
}

module.exports = { queryChannel, connectionChannel, shouldTrace }

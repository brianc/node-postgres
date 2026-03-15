'use strict'

const noopChannel = { hasSubscribers: false }

let poolConnectChannel = noopChannel
let poolReleaseChannel = noopChannel
let poolRemoveChannel = noopChannel

try {
  let dc
  if (typeof process.getBuiltInModule === 'function') {
    dc = process.getBuiltInModule('diagnostics_channel')
  } else {
    dc = require('diagnostics_channel')
  }
  if (typeof dc.tracingChannel === 'function') {
    poolConnectChannel = dc.tracingChannel('pg:pool:connect')
  }
  if (typeof dc.channel === 'function') {
    poolReleaseChannel = dc.channel('pg:pool:release')
    poolRemoveChannel = dc.channel('pg:pool:remove')
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

module.exports = { poolConnectChannel, poolReleaseChannel, poolRemoveChannel, shouldTrace }

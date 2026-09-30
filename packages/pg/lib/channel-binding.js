'use strict'

// Support for libpq's channel_binding parameter, which says whether SCRAM authentication
// has to be bound to the server's certificate:
// https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNECT-CHANNEL-BINDING

const nodeUtils = require('util')
const defaults = require('./defaults')

const channelBindingLevels = ['disable', 'prefer', 'require']

const emitEnableChannelBindingDeprecationNotice = nodeUtils.deprecate(
  () => {},
  'enableChannelBinding is deprecated: instead, please set channel_binding to "disable", "prefer" or "require"'
)

function channelBindingFromDeprecatedBoolean(value, force = false) {
  if (value === undefined && !force) return // pass undefined straight through, no warning, unless forced
  emitEnableChannelBindingDeprecationNotice()
  // note: we pass through valid string values to avoid confusion, otherwise
  // "disable" and "require" would both resolve as truthy and mean "prefer"
  return channelBindingLevels.includes(value) ? value : value ? 'prefer' : 'disable'
}

function validatedChannelBinding(value) {
  if (!channelBindingLevels.includes(value)) {
    throw new Error(`Invalid channel_binding value: "${value}". Valid values are "disable", "prefer" and "require".`)
  }
  return value
}

function resolveChannelBinding(channelBinding, enableChannelBinding) {
  const value =
    channelBinding ??
    channelBindingFromDeprecatedBoolean(enableChannelBinding) ??
    process.env.PGCHANNELBINDING ??
    defaults.channel_binding

  return validatedChannelBinding(value)
}

module.exports = {
  channelBindingLevels,
  channelBindingFromDeprecatedBoolean,
  validatedChannelBinding,
  resolveChannelBinding,
}

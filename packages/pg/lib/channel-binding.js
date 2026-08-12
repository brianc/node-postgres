'use strict'

// Support for libpq's channel_binding parameter, which says whether SCRAM authentication
// has to be bound to the server's certificate:
// https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNECT-CHANNEL-BINDING

const defaults = require('./defaults')

const channelBindingLevels = ['disable', 'prefer', 'require']

// Accepts the levels libpq's channel_binding parameter defines, plus the booleans that
// pg's original enableChannelBinding option took. Any other non-string keeps its
// historical truthiness, so previously working configs keep working. A string that is not
// a level is refused rather than read as the weakest one that resembles it.
const normalizeChannelBinding = function (value) {
  if (typeof value !== 'string') {
    return value ? 'prefer' : 'disable'
  }
  if (!channelBindingLevels.includes(value)) {
    throw new Error(
      `Invalid channel_binding value: "${value}". Valid values are "disable", "prefer" and "require" (or a boolean).`
    )
  }
  return value
}

// channel_binding, being libpq's own spelling, wins over the older
// enableChannelBinding option, then the environment, then the default.
const resolveChannelBinding = function (channelBinding, enableChannelBinding) {
  const value = [channelBinding, enableChannelBinding, process.env.PGCHANNELBINDING, defaults.channel_binding].find(
    (candidate) => candidate !== undefined && candidate !== null
  )
  return normalizeChannelBinding(value)
}

module.exports = { channelBindingLevels, normalizeChannelBinding, resolveChannelBinding }

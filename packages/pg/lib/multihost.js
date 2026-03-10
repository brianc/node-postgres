'use strict'

class MultiHost {
  // What probe query type to run for the given targetSessionAttrs
  static probeType(targetAttrs) {
    switch (targetAttrs) {
      case 'read-write':
      case 'read-only':
        return 'tx_read_only'
      case 'primary':
      case 'standby':
      case 'prefer-standby':
        return 'is_in_recovery'
      default:
        return null
    }
  }

  // Return params merged with values from a probe row so hostMatches() can decide
  static applyProbeResult(probeType, row, params) {
    const val = row.fields[0]?.toString('utf8') ?? null
    if (val === null) {
      return params
    }
    if (probeType === 'tx_read_only') {
      return { ...params, default_transaction_read_only: val, in_hot_standby: val }
    }
    return { ...params, in_hot_standby: val === 't' ? 'on' : 'off' }
  }

  // Can we decide host suitability from ParameterStatus messages alone (skip probe)?
  static canDecideFromParams(targetAttrs, params) {
    switch (targetAttrs) {
      case 'read-write':
      case 'read-only':
        return params.in_hot_standby !== undefined && params.default_transaction_read_only !== undefined
      case 'primary':
      case 'standby':
      case 'prefer-standby':
        return params.in_hot_standby !== undefined
      default:
        return false
    }
  }

  // Does this host satisfy targetSessionAttrs?
  static hostMatches(targetAttrs, params, hostIndex, hostCount, preferStandbyPass) {
    switch (targetAttrs) {
      case 'read-write':
        return params.in_hot_standby !== 'on' && params.default_transaction_read_only !== 'on'
      case 'read-only':
        return params.in_hot_standby === 'on' || params.default_transaction_read_only === 'on'
      case 'primary':
        return params.in_hot_standby !== 'on'
      case 'standby':
        return params.in_hot_standby !== 'off'
      case 'prefer-standby':
        if (preferStandbyPass === 2) {
          return true
        }
        return params.in_hot_standby !== 'off' || hostIndex + 1 >= hostCount
      default:
        return true
    }
  }
}

module.exports = MultiHost

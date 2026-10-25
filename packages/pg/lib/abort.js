'use strict'

function isAbortSignal(signal) {
  return (
    signal &&
    typeof signal === 'object' &&
    typeof signal.aborted === 'boolean' &&
    typeof signal.addEventListener === 'function' &&
    typeof signal.removeEventListener === 'function'
  )
}

function getAbortReason(signal) {
  if (signal.reason !== undefined) {
    return signal.reason
  }
  const error = new Error('This operation was aborted')
  error.name = 'AbortError'
  error.code = 'ABORT_ERR'
  return error
}

module.exports = { getAbortReason, isAbortSignal }

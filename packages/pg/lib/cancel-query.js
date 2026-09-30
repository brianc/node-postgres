'use strict'

module.exports = function cancelQuery(client) {
  if (!client || typeof client._cancelQuery !== 'function') {
    return Promise.reject(new TypeError('cancelQuery requires a connected pg Client'))
  }
  return client._cancelQuery(false)
}

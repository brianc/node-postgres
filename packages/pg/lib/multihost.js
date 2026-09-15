'use strict'

const { once } = require('events')
const Connection = require('./connection')

async function query(connection, text, signal) {
  let value
  const onRow = (row) => {
    value = row.fields[0]?.toString('utf8')
  }
  connection.once('dataRow', onRow)
  const ready = once(connection, 'readyForQuery', { signal })
  try {
    connection.query(text)
    await ready
    return value
  } finally {
    connection.removeListener('dataRow', onRow)
    // A custom stream can throw before we await the server's response.
    ready.catch(() => {})
  }
}

async function matchesTarget(connection, target, params, signal) {
  switch (target) {
    case 'read-write':
    case 'read-only': {
      let readOnly = params.default_transaction_read_only
      if (params.in_hot_standby === 'on') {
        readOnly = 'on'
      } else if (readOnly === undefined || params.in_hot_standby === undefined) {
        readOnly = await query(connection, 'SHOW transaction_read_only', signal)
      }
      return readOnly === (target === 'read-only' ? 'on' : 'off')
    }
    case 'primary':
    case 'standby': {
      if (params.in_hot_standby !== undefined) {
        return params.in_hot_standby === (target === 'standby' ? 'on' : 'off')
      }
      const recovery = await query(connection, 'SELECT pg_catalog.pg_is_in_recovery()', signal)
      return recovery === (target === 'standby' ? 't' : 'f')
    }
    default:
      return true
  }
}

module.exports = async function connectMultiHost(client, config) {
  const hosts = [].concat(client.host)
  const ports = [].concat(client.port)
  const target = client.connectionParameters.targetSessionAttrs || 'any'
  const targets = target === 'prefer-standby' ? ['standby', 'any'] : [target]
  const password = client.password
  let connection = client.connection
  let lastError

  for (const attrs of targets) {
    for (let i = 0; i < hosts.length; i++) {
      connection = connection || new Connection(config)
      client.connection = connection
      client.host = client.connectionParameters.host = hosts[i]
      client.port = client.connectionParameters.port = ports.length === 1 ? ports[0] : ports[i]
      client.connectionParameters.isDomainSocket = typeof client.host === 'string' && client.host.startsWith('/')
      client.password = client.connectionParameters.password = password
      const controller = new AbortController()
      const { signal } = controller
      const params = {}
      let connected = false
      let probing = false
      let queryError
      let accepted = false
      const onConnect = () => {
        connected = true
      }
      const onError = (err) => {
        if (!signal.aborted) {
          lastError = err
          controller.abort()
        }
      }
      const onErrorMessage = (err) => {
        queryError = err
        onError(err)
      }
      const onEnd = () =>
        onError(new Error(client._ending ? 'Connection terminated' : 'Connection terminated unexpectedly'))
      const onParameter = (msg) => {
        params[msg.parameterName] = msg.parameterValue
      }
      connection.once('connect', onConnect)
      connection.on('error', onError)
      connection.on('errorMessage', onErrorMessage)
      connection.on('end', onEnd)
      connection.on('parameterStatus', onParameter)

      try {
        const ready = once(connection, 'readyForQuery', { signal })
        try {
          client._connectHost(client.port, client.host)
        } catch (err) {
          onError(err)
        }
        const [message] = await ready
        probing = true
        const matches = await matchesTarget(connection, attrs, params, signal)
        if (signal.aborted) {
          throw lastError
        }
        if (client._ending) throw new Error('Connection terminated')
        if (matches) {
          accepted = true
          client._attachListeners(connection)
          return message
        }
        lastError = null
      } catch (err) {
        if (!signal.aborted) {
          lastError = err
        }
        // Only a failed session probe may retry after the transport connects.
        if (client._ending || connection._ending || (connected && (!probing || lastError !== queryError))) {
          throw lastError
        }
      } finally {
        connection.removeListener('end', onEnd)
        if (accepted) {
          connection.removeListener('connect', onConnect)
          connection.removeListener('errorMessage', onErrorMessage)
          connection.removeListener('parameterStatus', onParameter)
          connection.removeListener('error', onError)
        } else {
          controller.abort()
          // Preserve Client.end() callbacks while detaching the discarded backend.
          for (const event of connection.eventNames()) {
            if (event !== 'end') connection.removeAllListeners(event)
          }
          connection.on('error', () => {})
          connection._ending = true
          if (connected) connection.end()
          else if (connection.stream.destroy) connection.stream.destroy()
          connection = null
        }
      }
    }
  }
  throw lastError || new Error('None of the hosts satisfy target_session_attrs="' + target + '"')
}

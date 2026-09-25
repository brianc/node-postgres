'use strict'

module.exports = function cancelConnection(Connection, connection, processID, secretKey, timeoutMillis, signal) {
  const rejectBeforeConnect = (message) => {
    const error = new Error(message)
    Object.defineProperty(error, 'cancelDispatchMayHaveStarted', { value: false })
    return Promise.reject(error)
  }

  if (connection._hasCustomStream && !connection._streamFactory) {
    return rejectBeforeConnect('Cannot cancel a query using a concrete custom stream instance')
  }

  const port = connection._cancelPort || connection._connectPort
  const host = connection._cancelHost || connection._connectHost
  if (port === undefined || port === null) {
    return rejectBeforeConnect('Cannot cancel a query before the connection endpoint is known')
  }

  const transport = new Connection({
    stream: connection._streamFactory || undefined,
    ssl: connection.ssl,
    sslNegotiation: connection.sslNegotiation,
    sslServername: connection._sslServername || connection._connectHost,
  })
  const timeout = timeoutMillis > 0 ? timeoutMillis : 5000

  return new Promise((resolve, reject) => {
    let settled = false
    let writeAttempted = false
    let writeCompleted = false

    const cleanup = (keepErrorListener) => {
      clearTimeout(timer)
      transport.removeListener('connect', onConnect)
      transport.removeListener('sslconnect', sendCancel)
      if (!keepErrorListener) {
        transport.removeListener('error', fail)
      }
      transport.removeListener('end', onEnd)
      signal?.removeEventListener?.('abort', onAbort)
    }

    const finish = (error) => {
      if (settled) {
        return
      }
      settled = true
      if (error) {
        cleanup(true)
        Object.defineProperty(error, 'cancelDispatchMayHaveStarted', { value: writeAttempted })
        transport.stream.destroy?.()
        reject(error)
      } else {
        cleanup(false)
        resolve()
      }
    }

    const fail = (error) => finish(error instanceof Error ? error : new Error(String(error)))

    const onAbort = () => {
      const reason = signal.reason
      fail(reason instanceof Error ? reason : new Error('Cancel request aborted'))
    }

    const onEnd = () => {
      if (!writeCompleted) {
        fail(new Error('Cancel connection ended before the request was written'))
        return
      }
      finish()
    }

    const sendCancel = () => {
      if (settled || writeAttempted) {
        return
      }
      writeAttempted = true
      try {
        const accepted = transport.cancel(processID, secretKey, (error) => {
          if (error) {
            fail(error)
            return
          }
          writeCompleted = true
        })
        if (accepted === false) {
          writeAttempted = false
          fail(new Error('Cancel connection is not writable'))
        }
      } catch (error) {
        fail(error)
      }
    }

    const onConnect = () => {
      if (!transport.ssl) {
        sendCancel()
      } else if (transport.sslNegotiation !== 'direct') {
        transport.requestSsl()
      }
    }

    const timer = setTimeout(() => {
      const error = new Error('Cancel request timeout')
      error.code = 'PG_CANCEL_TIMEOUT'
      fail(error)
    }, timeout)
    timer.unref?.()

    transport.on('connect', onConnect)
    transport.on('sslconnect', sendCancel)
    transport.on('error', fail)
    transport.on('end', onEnd)
    signal?.addEventListener?.('abort', onAbort, { once: true })

    if (signal?.aborted) {
      onAbort()
      return
    }

    try {
      transport.connect(port, host)
    } catch (error) {
      fail(error)
    }
  })
}

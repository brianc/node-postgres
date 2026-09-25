'use strict'

const { getAbortReason, isAbortSignal } = require('./abort')

function create(native) {
  const handleQueryError = (client, query, error, attachNative) => {
    if (native && attachNative) {
      query.native = client.native
    }
    if (native) {
      query.handleError(error)
    } else {
      query.handleError(error, client.connection)
    }
  }

  const rejectQuery = (client, query, error, attachNative = false) => {
    process.nextTick(() => handleQueryError(client, query, error, attachNative))
  }

  const settle = (client, state, error, value) => {
    if (state.done) {
      return
    }
    state.done = true
    if (state.onEnd) {
      client.removeListener('end', state.onEnd)
    }
    if (client._cancelState === state) {
      client._cancelState = null
    }
    if (error) {
      state.reject(error)
    } else {
      state.resolve(value)
    }
    client._pulseQueryQueue()
  }

  const maybeComplete = (client, state) => {
    if (state.queryDone && state.transportDone) {
      settle(client, state, null, true)
    }
  }

  const handleJsFailure = (client, state, error) => {
    if (state.done) {
      return
    }
    if (state.failClosed || error.cancelDispatchMayHaveStarted) {
      state.failure = error
      client._queryable = false
      client._ending = true
      if (client._ended) {
        settle(client, state, error)
      } else {
        client.connection.stream.destroy()
      }
      return
    }
    settle(client, state, error)
  }

  const begin = (client, state) => {
    if (state.done || state.started) {
      return
    }
    state.started = true

    if (native) {
      const complete = (error) => {
        if (state.done) {
          return
        }
        if (error) {
          settle(client, state, error)
          if (state.failClosed) {
            client._queryable = false
            client.end(() => {})
          }
          return
        }
        state.transportDone = true
        maybeComplete(client, state)
      }
      try {
        client.native.cancel(complete)
      } catch (error) {
        complete(error)
      }
      return
    }

    state.controller = new AbortController()
    state.onEnd = () => {
      const error = state.failure || new Error('Connection terminated during query cancellation')
      state.controller.abort(error)
      settle(client, state, error)
    }
    client.once('end', state.onEnd)

    let cancellation
    try {
      cancellation = client.connection.cancelWithClone(
        client.processID,
        client.secretKey,
        client._connectionTimeoutMillis,
        state.controller.signal
      )
    } catch (error) {
      handleJsFailure(client, state, error)
      return
    }
    cancellation
      .then(() => {
        if (state.done) {
          return
        }
        state.transportDone = true
        maybeComplete(client, state)
      })
      .catch((error) => handleJsFailure(client, state, error))
  }

  const cancel = (client, failClosed) => {
    const reject = (error) => new client._Promise((resolve, reject) => reject(error))
    const resolve = (value) => new client._Promise((resolve) => resolve(value))

    if (client.pipeline) {
      return reject(new Error('Query cancellation is not supported in pipeline mode'))
    }
    if (!client._connected || !client._queryable || client._ending || (!native && client._ended)) {
      return reject(new Error('Client is not connected and queryable'))
    }
    if (client._cancelState) {
      client._cancelState.failClosed ||= failClosed
      return client._cancelState.promise
    }

    const target = native ? (client._hasActiveQuery() ? client._activeQuery : null) : client._getActiveQuery()
    if (!target) {
      return resolve(false)
    }

    const state = {
      target,
      failClosed: Boolean(failClosed),
      started: false,
      queryDone: false,
      transportDone: false,
      done: false,
    }
    state.promise = new client._Promise((resolve, reject) => {
      state.resolve = resolve
      state.reject = reject
    })
    client._cancelState = state

    if (target._pgSubmitState !== 'submitting') {
      begin(client, state)
    }
    return state.promise
  }

  const fail = (client, error) => {
    const state = client._cancelState
    if (!state) {
      return
    }
    if (native) {
      settle(client, state, error)
      return
    }
    const cancelError = state.failure || error
    state.controller?.abort(cancelError)
    settle(client, state, cancelError)
  }

  const queryDone = (client, query) => {
    const state = client._cancelState
    if (!state || state.done || (native ? state.target !== query : !state.started)) {
      return
    }
    state.queryDone = true
    maybeComplete(client, state)
  }

  const submitStart = (query) => {
    query._pgSubmitState = 'submitting'
    if (query.signal != null) {
      query._abortState = 'submitting'
    }
  }

  const submitEnd = (client, query, submitted) => {
    const state = client._cancelState
    if (!submitted) {
      query._pgSubmitState = 'settled'
      if (state && state.target === query && !state.started) {
        settle(client, state, null, false)
      }
      return
    }

    query._pgSubmitState = 'active'
    if (query.signal != null) {
      query._abortState = 'active'
    }
    if (state && state.target === query && !state.started) {
      begin(client, state)
    }
  }

  const prepareQuery = (client, query) => {
    const signal = query.signal
    if (signal == null) {
      return true
    }
    if (!isAbortSignal(signal)) {
      rejectQuery(client, query, new TypeError('Query signal must be an AbortSignal'), native)
      return false
    }

    const state = { abortRequested: false, settled: false }
    query._abortState = 'preparing'
    const originalCallback = query.callback
    const cleanup = () => signal.removeEventListener('abort', onAbort)

    query.callback = (error, result) => {
      if (state.settled) {
        return
      }
      state.settled = true
      query._abortState = 'settled'
      cleanup()
      originalCallback(error, result)
    }

    const onAbort = () => {
      if (state.settled) {
        return
      }
      const reason = getAbortReason(signal)
      if (query._abortState === 'preparing') {
        state.abortRequested = true
        state.reason = reason
        return
      }
      if (query._abortState === 'queued') {
        const index = client._queryQueue.indexOf(query)
        if (index !== -1) {
          client._queryQueue.splice(index, 1)
          query._abortState = 'aborting'
          rejectQuery(client, query, reason)
          client._pulseQueryQueue()
        }
        return
      }
      if (query._abortState === 'submitting' || query._abortState === 'active') {
        cancel(client, true).catch(() => {})
      }
    }

    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
    }
    if (state.abortRequested) {
      rejectQuery(client, query, state.reason, native)
      return false
    }
    return true
  }

  const rejectPipelineSignal = (client, query) => {
    if (!client.pipeline || query.signal == null) {
      return false
    }
    rejectQuery(client, query, new Error('AbortSignal is not supported in pipeline mode'), native)
    return true
  }

  const queue = (query) => {
    if (query.signal != null) {
      query._abortState = 'queued'
    }
  }

  const cancelLegacy = (client, query) => {
    const activeQuery = native ? client._activeQuery : client._getActiveQuery()
    if (activeQuery === query) {
      cancel(client, false).catch(() => {})
      return
    }

    const index = client._queryQueue.indexOf(query)
    if (index !== -1) {
      client._queryQueue.splice(index, 1)
      rejectQuery(client, query, getAbortReason({}))
      client._pulseQueryQueue()
    } else if (!native && client._sentQueryQueue.indexOf(query) !== -1) {
      // Query already sent on wire — can't remove it without corrupting the
      // pipeline. No-op the callback so the result is silently discarded.
      query.callback = () => {}
    }
  }

  return { cancel, cancelLegacy, fail, prepareQuery, queryDone, queue, rejectPipelineSignal, submitEnd, submitStart }
}

module.exports = { js: create(false), native: create(true) }

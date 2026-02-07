const Libpq = require('libpq')
const EventEmitter = require('events').EventEmitter
const util = require('util')
const assert = require('assert')
const types = require('pg-types')
const buildResult = require('./lib/build-result')
const CopyStream = require('./lib/copy-stream')

const Client = (module.exports = function (config) {
  if (!(this instanceof Client)) {
    return new Client(config)
  }

  config = config || {}

  EventEmitter.call(this)
  this.pq = new Libpq()
  this._reading = false
  this._read = this._read.bind(this)
  this._readPipeline = this._readPipeline.bind(this)

  // allow custom type conversion to be passed in
  this._types = config.types || types

  // allow config to specify returning results
  // as an array of values instead of a hash
  this.arrayMode = config.arrayMode || false
  this._resultCount = 0
  this._rows = undefined
  this._results = undefined

  // Pipeline mode configuration
  this._pipelineMode = config.pipelineMode || false
  this._pipelineMaxQueries = config.pipelineMaxQueries || 1000
  this._pipelineEnabled = false
  this._pipelineQueue = [] // Queue of pending queries with callbacks
  this._pipelinePendingCount = 0 // Count of sent but not yet resolved queries
  this._pipelineCallbacks = [] // Callbacks for sent queries awaiting results

  // lazy start the reader if notifications are listened for
  // this way if you only run sync queries you wont block
  // the event loop artificially
  this.on('newListener', (event) => {
    if (event !== 'notification') return
    this._startReading()
  })

  this.on('result', this._onResult.bind(this))
  this.on('readyForQuery', this._onReadyForQuery.bind(this))
})

util.inherits(Client, EventEmitter)

Client.prototype.connect = function (params, cb) {
  if (typeof params === 'function') {
    cb = params
    params = undefined
  }

  const self = this
  this.pq.connect(params, function (err) {
    if (err) return cb(err)

    // enter pipeline mode if enabled and supported
    if (self._pipelineMode && self._pipelineModeSupported()) {
      self._enterPipelineMode()
      self._startPipelineReading()
    }

    cb()
  })
}

Client.prototype.connectSync = function (params) {
  this.pq.connectSync(params)

  // enter pipeline mode if enabled and supported
  if (this._pipelineMode && this._pipelineModeSupported()) {
    this._enterPipelineMode()
    this._startPipelineReading()
  }
}

Client.prototype.query = function (text, values, cb) {
  if (typeof values === 'function') {
    cb = values
    values = undefined
  }

  if (this._pipelineMode) {
    return this._pipelineQuery(text, values, cb)
  }

  let queryFn
  if (Array.isArray(values)) {
    queryFn = () => {
      return this.pq.sendQueryParams(text, values)
    }
  } else {
    queryFn = () => {
      return this.pq.sendQuery(text)
    }
  }

  this._dispatchQuery(this.pq, queryFn, (err) => {
    if (err) return cb(err)
    this._awaitResult(cb)
  })
}

Client.prototype.prepare = function (statementName, text, nParams, cb) {
  const self = this
  const fn = function () {
    return self.pq.sendPrepare(statementName, text, nParams)
  }

  self._dispatchQuery(self.pq, fn, function (err) {
    if (err) return cb(err)
    self._awaitResult(cb)
  })
}

Client.prototype.execute = function (statementName, parameters, cb) {
  const self = this

  const fn = function () {
    return self.pq.sendQueryPrepared(statementName, parameters)
  }

  self._dispatchQuery(self.pq, fn, function (err, rows) {
    if (err) return cb(err)
    self._awaitResult(cb)
  })
}

Client.prototype.getCopyStream = function () {
  this.pq.setNonBlocking(true)
  this._stopReading()
  return new CopyStream(this.pq)
}

// cancel a currently executing query
Client.prototype.cancel = function (cb) {
  assert(cb, 'Callback is required')
  // result is either true or a string containing an error
  const result = this.pq.cancel()
  return setImmediate(function () {
    cb(result === true ? undefined : new Error(result))
  })
}

Client.prototype.querySync = function (text, values) {
  if (values) {
    this.pq.execParams(text, values)
  } else {
    this.pq.exec(text)
  }

  throwIfError(this.pq)
  const result = buildResult(this.pq, this._types, this.arrayMode)
  return result.rows
}

Client.prototype.prepareSync = function (statementName, text, nParams) {
  this.pq.prepare(statementName, text, nParams)
  throwIfError(this.pq)
}

Client.prototype.executeSync = function (statementName, parameters) {
  this.pq.execPrepared(statementName, parameters)
  throwIfError(this.pq)
  return buildResult(this.pq, this._types, this.arrayMode).rows
}

Client.prototype.escapeLiteral = function (value) {
  return this.pq.escapeLiteral(value)
}

Client.prototype.escapeIdentifier = function (value) {
  return this.pq.escapeIdentifier(value)
}

// export the version number so we can check it in node-postgres
module.exports.version = require('./package.json').version

Client.prototype.end = function (cb) {
  this._stopReading()
  this.pq.finish()
  if (cb) setImmediate(cb)
}

Client.prototype._readError = function (message) {
  const err = new Error(message || this.pq.errorMessage())
  this.emit('error', err)
}

Client.prototype._stopReading = function () {
  if (!this._reading) return
  this._reading = false
  this.pq.stopReader()
  this.pq.removeListener('readable', this._read)
}

Client.prototype._consumeQueryResults = function (pq) {
  return buildResult(pq, this._types, this.arrayMode)
}

Client.prototype._emitResult = function (pq) {
  const status = pq.resultStatus()
  switch (status) {
    case 'PGRES_FATAL_ERROR':
      this._queryError = new Error(this.pq.resultErrorMessage())
      break

    case 'PGRES_TUPLES_OK':
    case 'PGRES_COMMAND_OK':
    case 'PGRES_EMPTY_QUERY':
      {
        const result = this._consumeQueryResults(this.pq)
        this.emit('result', result)
      }
      break

    case 'PGRES_COPY_OUT':
    case 'PGRES_COPY_BOTH': {
      break
    }

    default:
      this._readError('unrecognized command status: ' + status)
      break
  }
  return status
}

// called when libpq is readable
Client.prototype._read = function () {
  const pq = this.pq
  // read waiting data from the socket
  // e.g. clear the pending 'select'
  if (!pq.consumeInput()) {
    // if consumeInput returns false
    // than a read error has been encountered
    return this._readError()
  }

  // check if there is still outstanding data
  // if so, wait for it all to come in
  if (pq.isBusy()) {
    return
  }

  // load our result object

  while (pq.getResult()) {
    const resultStatus = this._emitResult(this.pq)

    // if the command initiated copy mode we need to break out of the read loop
    // so a substream can begin to read copy data
    if (resultStatus === 'PGRES_COPY_BOTH' || resultStatus === 'PGRES_COPY_OUT') {
      break
    }

    // if reading multiple results, sometimes the following results might cause
    // a blocking read. in this scenario yield back off the reader until libpq is readable
    if (pq.isBusy()) {
      return
    }
  }

  this.emit('readyForQuery')

  let notice = this.pq.notifies()
  while (notice) {
    this.emit('notification', notice)
    notice = this.pq.notifies()
  }
}

// ensures the client is reading and
// everything is set up for async io
Client.prototype._startReading = function () {
  if (this._reading) return
  this._reading = true
  this.pq.on('readable', this._read)
  this.pq.startReader()
}

const throwIfError = function (pq) {
  const err = pq.resultErrorMessage() || pq.errorMessage()
  if (err) {
    throw new Error(err)
  }
}

Client.prototype._awaitResult = function (cb) {
  this._queryCallback = cb
  return this._startReading()
}

// wait for the writable socket to drain
Client.prototype._waitForDrain = function (pq, cb) {
  const res = pq.flush()
  // res of 0 is success
  if (res === 0) return cb()

  // res of -1 is failure
  if (res === -1) return cb(pq.errorMessage())

  // otherwise outgoing message didn't flush to socket
  // wait for it to flush and try again
  const self = this
  // you cannot read & write on a socket at the same time
  return pq.writable(function () {
    self._waitForDrain(pq, cb)
  })
}

// send an async query to libpq and wait for it to
// finish writing query text to the socket
Client.prototype._dispatchQuery = function (pq, fn, cb) {
  this._stopReading()
  const success = pq.setNonBlocking(true)
  if (!success) return cb(new Error('Unable to set non-blocking to true'))
  const sent = fn()
  if (!sent) return cb(new Error(pq.errorMessage() || 'Something went wrong dispatching the query'))
  this._waitForDrain(pq, cb)
}

Client.prototype._onResult = function (result) {
  if (this._resultCount === 0) {
    this._results = result
    this._rows = result.rows
  } else if (this._resultCount === 1) {
    this._results = [this._results, result]
    this._rows = [this._rows, result.rows]
  } else {
    this._results.push(result)
    this._rows.push(result.rows)
  }
  this._resultCount++
}

Client.prototype._onReadyForQuery = function () {
  // remove instance callback
  const cb = this._queryCallback
  this._queryCallback = undefined

  // remove instance query error
  const err = this._queryError
  this._queryError = undefined

  // remove instance rows
  const rows = this._rows
  this._rows = undefined

  // remove instance results
  const results = this._results
  this._results = undefined

  this._resultCount = 0

  if (cb) {
    cb(err, rows || [], results)
  }
}

// Check if pipeline mode is supported
Client.prototype._pipelineModeSupported = function () {
  return this.pq.pipelineModeSupported()
}

// Enter pipeline mode - allows sending multiple queries without waiting for results
Client.prototype._enterPipelineMode = function () {
  if (!this._pipelineModeSupported()) {
    throw new Error('Pipeline mode is not supported. Requires PostgreSQL 14+')
  }
  const result = this.pq.enterPipelineMode()
  if (result) {
    this._pipelineEnabled = true
    this.pq.setNonBlocking(true)
  }
  return result
}

// Exit pipeline mode
Client.prototype._exitPipelineMode = function () {
  if (!this._pipelineEnabled) {
    return true
  }
  const result = this.pq.exitPipelineMode()
  if (result) {
    this._pipelineEnabled = false
    this._pipelineQueue = []
    this._pipelinePendingCount = 0
    this._pipelineCallbacks = []
  }
  return result
}

// Get current pipeline status (0=off, 1=on, 2=aborted)
Client.prototype._pipelineStatus = function () {
  return this.pq.pipelineStatus()
}

// Send a sync point in the pipeline to trigger result delivery
Client.prototype._pipelineSync = function () {
  return this.pq.pipelineSync()
}

// Execute a query in pipeline mode
// Called by query() when pipelineMode is enabled
Client.prototype._pipelineQuery = function (text, values, cb) {
  // if pipeline mode is not enabled but was configured, auto-enter
  if (this._pipelineMode && !this._pipelineEnabled) {
    this._enterPipelineMode()
    this._startPipelineReading()
  }

  if (!this._pipelineEnabled) {
    const err = new Error('Pipeline mode is not enabled. Set pipelineMode: true in config.')
    if (cb) return setImmediate(() => cb(err))
    return Promise.reject(err)
  }

  // Check if we need to apply backpressure
  if (this._pipelinePendingCount >= this._pipelineMaxQueries) {
    // Queue the query for later execution
    const queued = { text, values, cb }
    this._pipelineQueue.push(queued)

    if (!cb) {
      return new Promise((resolve, reject) => {
        queued.cb = (err, rows, result) => {
          if (err) reject(err)
          else resolve(rows)
        }
      })
    }
    return
  }

  // Send the query - always use sendQueryParams in pipeline mode
  // (sendQuery is not allowed in pipeline mode)
  const params = Array.isArray(values) ? values : []
  const sent = this.pq.sendQueryParams(text, params)

  if (!sent) {
    const err = new Error(this.pq.errorMessage() || 'Failed to send query in pipeline mode')
    if (cb) return setImmediate(() => cb(err))
    return Promise.reject(err)
  }

  this._pipelinePendingCount++

  // Send sync to mark this query and trigger result delivery
  this._pipelineSync()

  // Flush to ensure the query and sync are sent
  this.pq.flush()

  if (cb) {
    this._pipelineCallbacks.push({ cb, resultCount: 0, rows: undefined, results: undefined, error: undefined })
    return
  }

  return new Promise((resolve, reject) => {
    this._pipelineCallbacks.push({
      cb: (err, rows, result) => {
        if (err) reject(err)
        else resolve(rows)
      },
      resultCount: 0,
      rows: undefined,
      results: undefined,
      error: undefined,
    })
  })
}

// Flush and wait for all pending pipeline queries to complete
Client.prototype._pipelineFlush = function (cb) {
  if (!this._pipelineEnabled) {
    if (cb) return setImmediate(cb)
    return Promise.resolve()
  }

  // Send sync to mark end of current batch
  this._pipelineSync()
  this.pq.flush()

  // Add a sync callback marker
  if (cb) {
    this._pipelineCallbacks.push({ cb, isSync: true })
    return
  }

  return new Promise((resolve, reject) => {
    this._pipelineCallbacks.push({
      cb: (err) => {
        if (err) reject(err)
        else resolve()
      },
      isSync: true,
    })
  })
}

// Start reading for pipeline mode
Client.prototype._startPipelineReading = function () {
  if (this._reading) return
  this._reading = true
  this.pq.on('readable', this._readPipeline)
  this.pq.startReader()
}

// Stop reading for pipeline mode
Client.prototype._stopPipelineReading = function () {
  if (!this._reading) return
  this._reading = false
  this.pq.stopReader()
  this.pq.removeListener('readable', this._readPipeline)
}

// Read handler specificaly for pipeline mode
Client.prototype._readPipeline = function () {
  const pq = this.pq

  // Read waiting data from the socket
  if (!pq.consumeInput()) {
    // Read error and notify all pending callbacks
    const err = new Error(pq.errorMessage())
    this._pipelineCallbacks.forEach((pending) => {
      if (pending.cb) pending.cb(err)
    })
    // Also notify queued queries
    this._pipelineQueue.forEach((queued) => {
      if (queued.cb) queued.cb(err)
    })
    this._pipelineCallbacks = []
    this._pipelinePendingCount = 0
    this._pipelineQueue = []
    return
  }

  // Process all available results
  // In pipeline mode, getResult() returns false for NULL markers between results
  // We should only break when isBusy() becomes true
  let loopCount = 0
  const maxLoops = 1000 // Safety limit
  while (!pq.isBusy() && loopCount < maxLoops) {
    loopCount++
    const hasResult = pq.getResult()
    if (!hasResult) {
      // NULL result - this is normal between query results and sync markers
      // Check if there are more pending callbacks, if so try again
      if (this._pipelineCallbacks.length === 0) {
        break
      }
      // Try one more time in case there's another result
      continue
    }

    const status = pq.resultStatus()

    // Handle pipeline sync point
    if (status === 'PGRES_PIPELINE_SYNC') {
      // Find and call the sync callback
      const idx = this._pipelineCallbacks.findIndex((p) => p.isSync)
      if (idx !== -1) {
        const syncCb = this._pipelineCallbacks.splice(idx, 1)[0]
        if (syncCb.cb) syncCb.cb()
      }
      continue
    }

    // Get the next pending callbacks
    if (this._pipelineCallbacks.length === 0) {
      continue
    }

    const pending = this._pipelineCallbacks[0]
    if (pending.isSync) {
      continue
    }

    if (status === 'PGRES_FATAL_ERROR') {
      pending.error = new Error(pq.resultErrorMessage())
    } else if (status === 'PGRES_TUPLES_OK' || status === 'PGRES_COMMAND_OK' || status === 'PGRES_EMPTY_QUERY') {
      const result = this._consumeQueryResults(pq)
      if (pending.resultCount === 0) {
        pending.rows = result.rows
        pending.results = result
      } else if (pending.resultCount === 1) {
        pending.rows = [pending.rows, result.rows]
        pending.results = [pending.results, result]
      } else {
        pending.rows.push(result.rows)
        pending.results.push(result)
      }
      pending.resultCount++
    }

    // Check if we need to get more results for this query (null result marks end)
    // For pipeline mode, each query gets exactly one result set typically
    // We complete the callback and move to the next one
    this._pipelineCallbacks.shift()
    this._pipelinePendingCount--

    if (pending.cb) {
      pending.cb(pending.error, pending.rows || [], pending.results)
    }

    // Process queued queries now that we have room
    this._processQueuedPipelineQueries()
  }

  if (loopCount >= maxLoops) {
    this.emit('error', new Error('Pipeline read loop exceeded max iterations - possible infinite loop detected'))
  }

  // Check for notifications
  let notice = pq.notifies()
  while (notice) {
    this.emit('notification', notice)
    notice = pq.notifies()
  }
}

// Process queued pipeline queries when there's room
Client.prototype._processQueuedPipelineQueries = function () {
  while (this._pipelineQueue.length > 0 && this._pipelinePendingCount < this._pipelineMaxQueries) {
    const queued = this._pipelineQueue.shift()

    // Always use sendQueryParams in pipeline mode
    const params = Array.isArray(queued.values) ? queued.values : []
    const sent = this.pq.sendQueryParams(queued.text, params)

    if (!sent) {
      const err = new Error(this.pq.errorMessage() || 'Failed to send queued query in pipeline mode')
      if (queued.cb) queued.cb(err)
      continue
    }

    this._pipelinePendingCount++

    // Send sync to trigger result delivery
    this._pipelineSync()
    this.pq.flush()

    this._pipelineCallbacks.push({
      cb: queued.cb,
      resultCount: 0,
      rows: undefined,
      results: undefined,
      error: undefined,
    })
  }
}

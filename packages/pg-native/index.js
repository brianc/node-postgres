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

  // allow custom type conversion to be passed in
  this._types = config.types || types

  // allow config to specify returning results
  // as an array of values instead of a hash
  this.arrayMode = config.arrayMode || false
  this._resultCount = 0
  this._rows = undefined
  this._results = undefined

  // Pipeline mode support
  this._pipelineMode = config.pipelineMode || false
  this._pendingCallbacks = []
  this._currentQueryError = undefined
  this._currentQueryRows = undefined
  this._currentQueryResults = undefined
  this._currentQueryResultCount = 0

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

// Pipeline mode property getter
Object.defineProperty(Client.prototype, 'pipelineMode', {
  get: function () {
    return this._pipelineMode
  },
})

// Check if pipeline mode is supported
Client.prototype.pipelineModeSupported = function () {
  return typeof this.pq.pipelineModeSupported === 'function' && this.pq.pipelineModeSupported()
}

Client.prototype.connect = function (params, cb) {
  const self = this
  this.pq.connect(params, function (err) {
    if (err) return cb(err)
    if (self._pipelineMode) {
      if (!self.pipelineModeSupported()) {
        return cb(new Error('Pipeline mode is not supported. Requires PostgreSQL 14+ client libraries.'))
      }
      if (!self.pq.enterPipelineMode()) {
        return cb(new Error('Failed to enter pipeline mode: ' + self.pq.errorMessage()))
      }
    }
    cb()
  })
}

Client.prototype.connectSync = function (params) {
  this.pq.connectSync(params)
  if (this._pipelineMode) {
    if (!this.pipelineModeSupported()) {
      throw new Error('Pipeline mode is not supported. Requires PostgreSQL 14+ client libraries.')
    }
    if (!this.pq.enterPipelineMode()) {
      throw new Error('Failed to enter pipeline mode: ' + this.pq.errorMessage())
    }
  }
}

Client.prototype.query = function (text, values, cb) {
  let queryFn

  if (typeof values === 'function') {
    cb = values
    values = undefined
  }

  // Use pipeline mode if enabled
  if (this._pipelineMode) {
    return this._pipelineQuery(text, values, cb)
  }

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

// Pipeline mode query implementation
Client.prototype._pipelineQuery = function (text, values, cb) {
  const self = this

  // Validate: no multi-statement queries in pipeline mode
  const statements = text.split(';').filter((s) => s.trim())
  if (statements.length > 1) {
    return setImmediate(() => cb(new Error('Multi-statement queries are not supported in pipeline mode')))
  }

  // Validate: no COPY in pipeline mode
  const upperText = text.trim().toUpperCase()
  if (upperText.startsWith('COPY ')) {
    return setImmediate(() => cb(new Error('COPY operations are not supported in pipeline mode')))
  }

  this._stopReading()

  const success = this.pq.setNonBlocking(true)
  if (!success) {
    return setImmediate(() => cb(new Error('Unable to set non-blocking to true')))
  }

  // Send the query
  let sent
  if (Array.isArray(values)) {
    sent = this.pq.sendQueryParams(text, values)
  } else {
    sent = this.pq.sendQuery(text)
  }

  if (!sent) {
    return setImmediate(() => cb(new Error(this.pq.errorMessage() || 'Failed to send query')))
  }

  // Send sync point
  if (!this.pq.pipelineSync()) {
    return setImmediate(() => cb(new Error('Failed to send pipeline sync')))
  }

  // Store callback for this query
  this._pendingCallbacks.push(cb)

  // Flush and start reading
  this._waitForDrain(this.pq, (err) => {
    if (err) {
      const pendingCb = self._pendingCallbacks.shift()
      if (pendingCb) pendingCb(new Error(err))
      return
    }
    self._startPipelineReading()
  })
}

// Start reading in pipeline mode
Client.prototype._startPipelineReading = function () {
  if (this._reading) return
  this._reading = true
  this.pq.on('readable', this._readPipeline.bind(this))
  this.pq.startReader()
}

// Read results in pipeline mode
Client.prototype._readPipeline = function () {
  const pq = this.pq

  if (!pq.consumeInput()) {
    return this._readError()
  }

  if (pq.isBusy()) {
    return
  }

  while (pq.getResult()) {
    const status = pq.resultStatus()

    if (status === 'PGRES_PIPELINE_SYNC') {
      // Query complete, call the callback
      const cb = this._pendingCallbacks.shift()
      if (cb) {
        const err = this._currentQueryError
        this._currentQueryError = undefined
        const rows = this._currentQueryRows
        this._currentQueryRows = undefined
        const results = this._currentQueryResults
        this._currentQueryResults = undefined
        this._currentQueryResultCount = 0
        cb(err, rows || [], results)
      }

      // If no more pending callbacks, stop reading
      if (this._pendingCallbacks.length === 0) {
        this._stopReading()
      }
      continue
    }

    if (status === 'PGRES_FATAL_ERROR') {
      this._currentQueryError = new Error(pq.resultErrorMessage())
      continue
    }

    if (status === 'PGRES_TUPLES_OK' || status === 'PGRES_COMMAND_OK' || status === 'PGRES_EMPTY_QUERY') {
      const result = this._consumeQueryResults(pq)
      this._onPipelineResult(result)
    }

    if (pq.isBusy()) {
      return
    }
  }
}

// Handle result in pipeline mode
Client.prototype._onPipelineResult = function (result) {
  if (this._currentQueryResultCount === 0) {
    this._currentQueryResults = result
    this._currentQueryRows = result.rows
  } else if (this._currentQueryResultCount === 1) {
    this._currentQueryResults = [this._currentQueryResults, result]
    this._currentQueryRows = [this._currentQueryRows, result.rows]
  } else {
    this._currentQueryResults.push(result)
    this._currentQueryRows.push(result.rows)
  }
  this._currentQueryResultCount++
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
  const self = this

  // In pipeline mode, wait for pending queries
  if (this._pipelineMode && this._pendingCallbacks.length > 0) {
    const checkPending = function () {
      if (self._pendingCallbacks.length === 0) {
        self._finishEnd(cb)
      } else {
        setTimeout(checkPending, 10)
      }
    }
    checkPending()
    return
  }

  this._finishEnd(cb)
}

Client.prototype._finishEnd = function (cb) {
  if (this._pipelineMode && this.pipelineModeSupported()) {
    this.pq.exitPipelineMode()
  }
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
  this.pq.removeListener('readable', this._readPipeline)
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

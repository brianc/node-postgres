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
  this.pq.connect(params, cb)
}

Client.prototype.connectSync = function (params) {
  this.pq.connectSync(params)
}

Client.prototype.query = function (text, values, cb) {
  let queryFn

  if (typeof values === 'function') {
    cb = values
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

    case 'PGRES_PIPELINE_SYNC':
    case 'PGRES_PIPELINE_ABORTED':
      break

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

// Send a batch of queries in pipeline mode and collect results in order.
// Each entry in `queries` is {text, values?, name?}.
// `cb(err, results)` where results is an array, one per query,
// of {err, rows, result} objects.
Client.prototype.pipeline = function (queries, cb) {
  const pq = this.pq

  if (!pq.pipelineModeSupported || !pq.pipelineModeSupported()) {
    return cb(new Error('Pipeline mode is not supported. Requires PostgreSQL 14+ client libraries.'))
  }

  if (!pq.enterPipelineMode()) {
    return cb(new Error(pq.errorMessage() || 'Failed to enter pipeline mode'))
  }

  pq.setNonBlocking(true)

  // Send all queries, each followed by a sync
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i]
    let sent
    if (q.name) {
      if (q._alreadyPrepared) {
        sent = pq.sendQueryPrepared(q.name, q.values || [])
      } else {
        // send prepare then execute in same pipeline batch
        sent = pq.sendPrepare(q.name, q.text, (q.values || []).length)
        if (sent) {
          sent = pq.sendQueryPrepared(q.name, q.values || [])
        }
      }
    } else if (q.values) {
      sent = pq.sendQueryParams(q.text, q.values)
    } else {
      sent = pq.sendQuery(q.text)
    }

    if (!sent) {
      const err = new Error(pq.errorMessage() || 'Failed to send pipelined query')
      pq.exitPipelineMode()
      return cb(err)
    }

    pq.pipelineSync()
  }

  // Flush all queued data to the socket
  this._waitForDrain(pq, (err) => {
    if (err) {
      pq.exitPipelineMode()
      return cb(err)
    }
    this._readPipelineResults(queries, cb)
  })
}

// Read pipeline results for `queries.length` sync points.
// Calls cb(null, results) when all syncs have been received.
Client.prototype._readPipelineResults = function (queries, cb) {
  const pq = this.pq
  const self = this
  const results = []
  let queryIndex = 0
  let currentResult = null
  let currentError = null

  const processResults = function () {
    if (!pq.consumeInput()) {
      pq.exitPipelineMode()
      return cb(new Error(pq.errorMessage() || 'Failed to consume input'))
    }

    while (!pq.isBusy()) {
      if (!pq.getResult()) {
        // null between result groups in pipeline — try again
        if (pq.isBusy()) return // more data needed
        if (!pq.getResult()) {
          // truly no more results — should not happen before all syncs
          break
        }
      }

      const status = pq.resultStatus()

      if (status === 'PGRES_PIPELINE_SYNC') {
        // End of one query's results + sync
        if (currentError) {
          results.push({ err: currentError, rows: null, result: null })
        } else if (currentResult) {
          results.push({ err: null, rows: currentResult.rows, result: currentResult })
        } else {
          results.push({ err: null, rows: [], result: null })
        }
        currentResult = null
        currentError = null
        queryIndex++

        if (queryIndex >= queries.length) {
          // All queries processed
          pq.exitPipelineMode()
          return cb(null, results)
        }
        continue
      }

      if (status === 'PGRES_FATAL_ERROR') {
        currentError = new Error(pq.resultErrorMessage())
        // Extract error fields
        const fields = pq.resultErrorFields()
        if (fields) {
          for (const key in fields) {
            currentError[key] = fields[key]
          }
        }
        continue
      }

      if (status === 'PGRES_PIPELINE_ABORTED') {
        // Query skipped due to previous error in same sync group
        continue
      }

      if (status === 'PGRES_TUPLES_OK' || status === 'PGRES_COMMAND_OK' || status === 'PGRES_EMPTY_QUERY') {
        currentResult = self._consumeQueryResults(pq)
        continue
      }
    }

    // Still waiting for more data — will be called again when readable
  }

  // Use the libuv readable watcher
  this._stopReading()
  let done = false
  const origCb = cb
  cb = function (err, results) {
    if (done) return
    done = true
    pq.removeListener('readable', onReadable)
    self._stopReading()
    origCb(err, results)
  }
  const onReadable = function () {
    processResults()
  }
  pq.on('readable', onReadable)
  pq.startReader()

  // Try an initial read in case data is already available
  processResults()
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

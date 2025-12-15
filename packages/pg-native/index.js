const Libpq = require('libpq')
const EventEmitter = require('events').EventEmitter
const assert = require('assert')
const types = require('pg-types')
const buildResult = require('./lib/build-result')
const CopyStream = require('./lib/copy-stream')

class ClientClass extends EventEmitter {
  constructor(config) {
    super()

    config = config || {}

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
  }

  connect(params, cb) {
    this.pq.connect(params, cb)
  }

  connectSync(params) {
    this.pq.connectSync(params)
  }

  query(text, values, cb) {
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

  prepare(statementName, text, nParams, cb) {
    const self = this
    const fn = function () {
      return self.pq.sendPrepare(statementName, text, nParams)
    }

    self._dispatchQuery(self.pq, fn, function (err) {
      if (err) return cb(err)
      self._awaitResult(cb)
    })
  }

  execute(statementName, parameters, cb) {
    const self = this

    const fn = function () {
      return self.pq.sendQueryPrepared(statementName, parameters)
    }

    self._dispatchQuery(self.pq, fn, function (err, rows) {
      if (err) return cb(err)
      self._awaitResult(cb)
    })
  }

  getCopyStream() {
    this.pq.setNonBlocking(true)
    this._stopReading()
    return new CopyStream(this.pq)
  }

  // cancel a currently executing query
  cancel(cb) {
    assert(cb, 'Callback is required')
    // result is either true or a string containing an error
    const result = this.pq.cancel()
    return setImmediate(function () {
      cb(result === true ? undefined : new Error(result))
    })
  }

  querySync(text, values) {
    if (values) {
      this.pq.execParams(text, values)
    } else {
      this.pq.exec(text)
    }

    throwIfError(this.pq)
    const result = buildResult(this.pq, this._types, this.arrayMode)
    return result.rows
  }

  prepareSync(statementName, text, nParams) {
    this.pq.prepare(statementName, text, nParams)
    throwIfError(this.pq)
  }

  executeSync(statementName, parameters) {
    this.pq.execPrepared(statementName, parameters)
    throwIfError(this.pq)
    return buildResult(this.pq, this._types, this.arrayMode).rows
  }

  escapeLiteral(value) {
    return this.pq.escapeLiteral(value)
  }

  escapeIdentifier(value) {
    return this.pq.escapeIdentifier(value)
  }

  end(cb) {
    this._stopReading()
    this.pq.finish()
    if (cb) setImmediate(cb)
  }

  _readError(message) {
    const err = new Error(message || this.pq.errorMessage())
    this.emit('error', err)
  }

  _stopReading() {
    if (!this._reading) return
    this._reading = false
    this.pq.stopReader()
    this.pq.removeListener('readable', this._read)
  }

  _consumeQueryResults(pq) {
    return buildResult(pq, this._types, this.arrayMode)
  }

  _emitResult(pq) {
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
  _read() {
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
  _startReading() {
    if (this._reading) return
    this._reading = true
    this.pq.on('readable', this._read)
    this.pq.startReader()
  }

  _awaitResult(cb) {
    this._queryCallback = cb
    return this._startReading()
  }

  // wait for the writable socket to drain
  _waitForDrain(pq, cb) {
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
  _dispatchQuery(pq, fn, cb) {
    this._stopReading()
    const success = pq.setNonBlocking(true)
    if (!success) return cb(new Error('Unable to set non-blocking to true'))
    const sent = fn()
    if (!sent) return cb(new Error(pq.errorMessage() || 'Something went wrong dispatching the query'))
    this._waitForDrain(pq, cb)
  }

  _onResult(result) {
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

  _onReadyForQuery() {
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
}
const throwIfError = function (pq) {
  const err = pq.resultErrorMessage() || pq.errorMessage()
  if (err) {
    throw new Error(err)
  }
}

// export the version number so we can check it in node-postgres
module.exports.version = require('./package.json').version

module.exports = function Client(config) {
  return new ClientClass(config)
}

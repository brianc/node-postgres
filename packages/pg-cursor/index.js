'use strict'
const Result = require('pg/lib/result.js')
const prepare = require('pg/lib/utils.js').prepareValue
const EventEmitter = require('events').EventEmitter
const util = require('util')

let nextUniqueID = 1 // concept borrowed from org.postgresql.core.v3.QueryExecutorImpl

function Cursor(text, values, config) {
  EventEmitter.call(this)

  this._conf = config || {}
  this.text = text
  this.values = values ? values.map(prepare) : null
  this.connection = null
  this._queue = []
  this.state = 'initialized'
  this._result = new Result(this._conf.rowMode, this._conf.types)
  this._cb = null
  this._rows = null
  this._portal = null
  this._ifNoData = this._ifNoData.bind(this)
  this._rowDescription = this._rowDescription.bind(this)
}

util.inherits(Cursor, EventEmitter)

Cursor.prototype._ifNoData = function () {
  this.state = 'idle'
  this._shiftQueue()
}

Cursor.prototype._rowDescription = function () {
  if (this.connection) {
    this.connection.removeListener('noData', this._ifNoData)
  }
}

Cursor.prototype.submit = function (connection) {
  this.connection = connection
  this._portal = 'C_' + nextUniqueID++

  const con = connection

  con.parse(
    {
      text: this.text,
    },
    true
  )

  con.bind(
    {
      portal: this._portal,
      values: this.values,
    },
    true
  )

  con.describe(
    {
      type: 'P',
      name: this._portal, // AWS Redshift requires a portal name
    },
    true
  )

  con.flush()

  if (this._conf.types) {
    this._result._getTypeParser = this._conf.types.getTypeParser
  }

  con.once('noData', this._ifNoData)
  con.once('rowDescription', this._rowDescription)
}

Cursor.prototype._shiftQueue = function () {
  if (this._queue.length) {
    this._getRows.apply(this, this._queue.shift())
  }
}

Cursor.prototype._closePortal = function () {
  // because we opened a named portal to stream results
  // we need to close the same named portal.  Leaving a named portal
  // open can lock tables for modification if inside a transaction.
  // see https://github.com/brianc/node-pg-cursor/issues/56
  this.connection.close({ type: 'P', name: this._portal })
  this.connection.sync()
}

Cursor.prototype.handleRowDescription = function (msg) {
  this._result.addFields(msg.fields)
  this.state = 'idle'
  this._shiftQueue()
}

Cursor.prototype.handleDataRow = function (msg) {
  const row = this._result.parseRow(msg.fields)
  this.emit('row', row, this._result)
  this._rows.push(row)
}

Cursor.prototype._sendRows = function () {
  this.state = 'idle'
  setImmediate(() => {
    const cb = this._cb
    // remove callback before calling it
    // because likely a new one will be added
    // within the call to this callback
    this._cb = null
    if (cb) {
      this._result.rows = this._rows
      cb(null, this._rows, this._result)
    }
    this._rows = []
  })
}

Cursor.prototype.handleCommandComplete = function (msg) {
  this._result.addCommandComplete(msg)
  this._closePortal()
}

Cursor.prototype.handlePortalSuspended = function () {
  this._sendRows()
}

Cursor.prototype.handleReadyForQuery = function () {
  this._sendRows()
  this.state = 'done'
  this.emit('end', this._result)
}

Cursor.prototype.handleEmptyQuery = function () {
  this.connection.sync()
}

Cursor.prototype.handleError = function (msg) {
  this.connection.removeListener('noData', this._ifNoData)
  this.connection.removeListener('rowDescription', this._rowDescription)
  this.state = 'error'
  this._error = msg
  // satisfy any waiting callback
  if (this._cb) {
    this._cb(msg)
  }
  // dispatch error to all waiting callbacks
  for (let i = 0; i < this._queue.length; i++) {
    this._queue.pop()[1](msg)
  }

  if (this.listenerCount('error') > 0) {
    // only dispatch error events if we have a listener
    this.emit('error', msg)
  }
  // call sync to keep this connection from hanging
  this.connection.sync()
}

Cursor.prototype._getRows = function (rows, cb) {
  this.state = 'busy'
  this._cb = cb
  this._rows = []
  const msg = {
    portal: this._portal,
    rows: rows,
  }
  this.connection.execute(msg, true)
  this.connection.flush()
}

// users really shouldn't be calling 'end' here and terminating a connection to postgres
// via the low level connection.end api
Cursor.prototype.end = util.deprecate(function (cb) {
  if (this.state !== 'initialized') {
    this.connection.sync()
  }
  this.connection.once('end', cb)
  this.connection.end()
}, 'Cursor.end is deprecated. Call end on the client itself to end a connection to the database.')

Cursor.prototype.close = function (cb) {
  if (!this.connection || this.state === 'done') {
    if (cb) {
      return setImmediate(cb)
    } else {
      return
    }
  }
  this._closePortal()
  this.state = 'done'
  if (cb) {
    this.connection.once('readyForQuery', function () {
      cb()
    })
  }
}

Cursor.prototype.read = function (rows, cb) {
  if (this.state === 'idle') {
    return this._getRows(rows, cb)
  }
  if (this.state === 'busy' || this.state === 'initialized') {
    return this._queue.push([rows, cb])
  }
  if (this.state === 'error') {
    return setImmediate(() => cb(this._error))
  }
  if (this.state === 'done') {
    return setImmediate(() => cb(null, []))
  } else {
    throw new Error('Unknown state: ' + this.state)
  }
}

module.exports = Cursor

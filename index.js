'use strict'
const Result = require('./pg').Result
const prepare = require('./pg').prepareValue
const EventEmitter = require('events').EventEmitter
const util = require('util')

function Cursor (text, values, config) {
  EventEmitter.call(this)

  this._conf = config || { }
  this.text = text
  this.values = values ? values.map(prepare) : null
  this.connection = null
  this._queue = []
  this.state = 'initialized'
  this._result = new Result(this._conf.rowMode)
  this._cb = null
  this._rows = null
}

util.inherits(Cursor, EventEmitter)

Cursor.prototype.submit = function (connection) {
  this.connection = connection

  const con = connection

  con.parse({
    text: this.text
  }, true)

  con.bind({
    values: this.values
  }, true)

  con.describe({
    type: 'P',
    name: '' // use unamed portal
  }, true)

  con.flush()

  const ifNoData = () => {
    this.state = 'idle'
    this._shiftQueue()
  }

  if (this._conf.types) {
    this._result._getTypeParser = this._conf.types.getTypeParser
  }

  con.once('noData', ifNoData)
  con.once('rowDescription', () => {
    con.removeListener('noData', ifNoData)
  })
}

Cursor.prototype._shiftQueue = function () {
  if (this._queue.length) {
    this._getRows.apply(this, this._queue.shift())
  }
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

Cursor.prototype.handleCommandComplete = function () {
  this.connection.sync()
}

Cursor.prototype.handlePortalSuspended = function () {
  this._sendRows()
}

Cursor.prototype.handleReadyForQuery = function () {
  this._sendRows()
  this.emit('end', this._result)
  this.state = 'done'
}

Cursor.prototype.handleEmptyQuery = function () {
  this.connection.sync()
}

Cursor.prototype.handleError = function (msg) {
  this.state = 'error'
  this._error = msg
  // satisfy any waiting callback
  if (this._cb) {
    this._cb(msg)
  }
  // dispatch error to all waiting callbacks
  for (var i = 0; i < this._queue.length; i++) {
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
    portal: '',
    rows: rows
  }
  this.connection.execute(msg, true)
  this.connection.flush()
}

Cursor.prototype.end = function (cb) {
  if (this.state !== 'initialized') {
    this.connection.sync()
  }
  this.connection.stream.once('end', cb)
  this.connection.end()
}

Cursor.prototype.close = function (cb) {
  if (this.state === 'done') {
    return setImmediate(cb)
  }
  this.connection.close({type: 'P'})
  this.connection.sync()
  this.state = 'done'
  if (cb) {
    this.connection.once('closeComplete', function () {
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

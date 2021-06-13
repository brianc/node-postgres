'use strict'
const Result = require('pg/lib/result.js')
const prepare = require('pg/lib/utils.js').prepareValue
const EventEmitter = require('events').EventEmitter
const util = require('util')

let nextUniqueID = 1 // concept borrowed from org.postgresql.core.v3.QueryExecutorImpl

class Cursor extends EventEmitter {
  constructor(text, values, config) {
    super()

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

  _ifNoData() {
    this.state = 'idle'
    this._shiftQueue()
    if (this.connection) {
      this.connection.removeListener('rowDescription', this._rowDescription)
    }
  }

  _rowDescription() {
    if (this.connection) {
      this.connection.removeListener('noData', this._ifNoData)
    }
  }

  submit(connection) {
    this.state = 'submitted'
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

  _shiftQueue() {
    if (this._queue.length) {
      this._getRows.apply(this, this._queue.shift())
    }
  }

  _closePortal() {
    // because we opened a named portal to stream results
    // we need to close the same named portal.  Leaving a named portal
    // open can lock tables for modification if inside a transaction.
    // see https://github.com/brianc/node-pg-cursor/issues/56
    this.connection.close({ type: 'P', name: this._portal })

    // If we've received an error we already sent a sync message.
    // do not send another sync as it triggers another readyForQuery message.
    if (this.state !== 'error') {
      this.connection.sync()
    }
  }

  handleRowDescription(msg) {
    this._result.addFields(msg.fields)
    this.state = 'idle'
    this._shiftQueue()
  }

  handleDataRow(msg) {
    const row = this._result.parseRow(msg.fields)
    this.emit('row', row, this._result)
    this._rows.push(row)
  }

  _sendRows() {
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

  handleCommandComplete(msg) {
    this._result.addCommandComplete(msg)
    this._closePortal()
  }

  handlePortalSuspended() {
    this._sendRows()
  }

  handleReadyForQuery() {
    this._sendRows()
    this.state = 'done'
    this.emit('end', this._result)
  }

  handleEmptyQuery() {
    this.connection.sync()
  }

  handleError(msg) {
    // If we're in an initialized state we've never been submitted
    // and don't have a connection instance reference yet.
    // This can happen if you queue a stream and close the client before
    // the client has submitted the stream.  In this scenario we don't have
    // a connection so there's nothing to unsubscribe from.
    if (this.state !== 'initialized') {
      this.connection.removeListener('noData', this._ifNoData)
      this.connection.removeListener('rowDescription', this._rowDescription)
      // call sync to trigger a readyForQuery
      this.connection.sync()
    }

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
  }

  _getRows(rows, cb) {
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
  end(cb) {
    if (this.state !== 'initialized') {
      this.connection.sync()
    }
    this.connection.once('end', cb)
    this.connection.end()
  }

  close(cb) {
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

  read(rows, cb) {
    if (this.state === 'idle' || this.state === 'submitted') {
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
}

Cursor.prototype.end = util.deprecate(
  Cursor.prototype.end,
  'Cursor.end is deprecated. Call end on the client itself to end a connection to the database.'
)

module.exports = Cursor

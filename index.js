'use strict'
var Cursor = require('pg-cursor')
var Readable = require('stream').Readable

class PgQueryStream extends Readable {
  constructor (text, values, options) {
    super(Object.assign({ objectMode: true }, options))
    this.cursor = new Cursor(text, values)
    this._reading = false
    this._closed = false
    this.batchSize = (options || { }).batchSize || 100

    // delegate Submittable callbacks to cursor
    this.handleRowDescription = this.cursor.handleRowDescription.bind(this.cursor)
    this.handleDataRow = this.cursor.handleDataRow.bind(this.cursor)
    this.handlePortalSuspended = this.cursor.handlePortalSuspended.bind(this.cursor)
    this.handleCommandComplete = this.cursor.handleCommandComplete.bind(this.cursor)
    this.handleReadyForQuery = this.cursor.handleReadyForQuery.bind(this.cursor)
    this.handleError = this.cursor.handleError.bind(this.cursor)
  }

  submit (connection) {
    this.cursor.submit(connection)
    return this
  }

  close (callback) {
    this._closed = true
    const cb = callback || (() => this.emit('close'))
    this.cursor.close(cb)
  }

  _read (size) {
    if (this._reading || this._closed) {
      return false
    }
    this._reading = true
    const readAmount = Math.max(size, this.batchSize)
    this.cursor.read(readAmount, (err, rows) => {
      if (this._closed) {
        return
      }
      if (err) {
        return this.emit('error', err)
      }
      // if we get a 0 length array we've read to the end of the cursor
      if (!rows.length) {
        this._closed = true
        setImmediate(() => this.emit('close'))
        return this.push(null)
      }

      // push each row into the stream
      this._reading = false
      for (var i = 0; i < rows.length; i++) {
        this.push(rows[i])
      }
    })
  }
}

module.exports = PgQueryStream

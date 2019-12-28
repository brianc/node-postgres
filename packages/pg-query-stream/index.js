'use strict'

const { Readable } = require('stream')
const Cursor = require('pg-cursor')

class PgQueryStream extends Readable {
  constructor(text, values, { rowMode = undefined, types = undefined, batchSize = 100 } = {}) {
    // https://nodejs.org/api/stream.html#stream_new_stream_readable_options
    super({ objectMode: true, emitClose: true, autoDestroy: true, highWaterMark: batchSize })
    this.cursor = new Cursor(text, values, { rowMode, types })

    this._reading = false
    this._destroyCallback = undefined

    // delegate Submittable callbacks to cursor
    this.handleRowDescription = this.cursor.handleRowDescription.bind(this.cursor)
    this.handleDataRow = this.cursor.handleDataRow.bind(this.cursor)
    this.handlePortalSuspended = this.cursor.handlePortalSuspended.bind(this.cursor)
    this.handleCommandComplete = this.cursor.handleCommandComplete.bind(this.cursor)
    this.handleReadyForQuery = this.cursor.handleReadyForQuery.bind(this.cursor)
    this.handleError = this.cursor.handleError.bind(this.cursor)
  }

  submit(connection) {
    this.cursor.submit(connection)
  }

  // Backwards compatibility.
  // A stream should be 'closed' using destroy().
  close(callback) {
    if (this.destroyed) {
      if (callback) setImmediate(callback)
    } else {
      if (callback) this.once('close', callback)
      this.destroy()
    }
  }

  _destroy(_err, callback) {
    if (this._reading) {
      this._destroyCallback = callback
    } else {
      this.cursor.close(callback)
    }
  }

  // https://nodejs.org/api/stream.html#stream_readable_read_size_1
  _read(size) {
    // Prevent _destroy() from closing while reading
    this._reading = true

    this.cursor.read(size, (err, rows, result) => {
      this._reading = false

      if (this.destroyed) {
        // Destroyed while reading
        this.cursor.close(this._destroyCallback)
        this._destroyCallback = undefined
      } else if (err) {
        // https://nodejs.org/api/stream.html#stream_errors_while_reading
        this.destroy(err)
      } else {
        for (const row of rows) this.push(row)
        if (rows.length < size) this.push(null)
      }
    })
  }
}

module.exports = PgQueryStream

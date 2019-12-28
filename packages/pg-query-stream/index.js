const { Readable } = require('stream')
const Cursor = require('pg-cursor')

class PgQueryStream extends Readable {
  constructor(text, values, config = {}) {
    const { batchSize = 100 } = config;
    // https://nodejs.org/api/stream.html#stream_new_stream_readable_options
    super({ objectMode: true, emitClose: true, autoDestroy: true, highWaterMark: batchSize })
    this.cursor = new Cursor(text, values, config)

    this._reading = false
    this._callbacks = []
    this._err = undefined;

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

  close(callback) {
    if (this.destroyed) {
      if (callback) setImmediate(callback)
    } else {
      if (callback) this.once('close', callback)
      this.destroy()
    }
  }

  _close() {
    this.cursor.close((err) => {
      let cb
      while ((cb = this._callbacks.pop())) cb(err || this._err)
    })
  }

  _destroy(_err, callback) {
    this._err = _err;
    this._callbacks.push(callback)
    if (!this._reading) {
      this._close()
    }
  }

  // https://nodejs.org/api/stream.html#stream_readable_read_size_1
  _read(size) {
    // Prevent _destroy() from closing while reading
    this._reading = true

    this.cursor.read(size, (err, rows, result) => {
      this._reading = false

      if (this.destroyed) {
        // Destroyed while reading?
        this._close()
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

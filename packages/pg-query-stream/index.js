const { Readable } = require('stream')
const Cursor = require('pg-cursor')

class PgQueryStream extends Readable {
  constructor(text, values, config = {}) {
    const { batchSize, highWaterMark = 100 } = config
    // https://nodejs.org/api/stream.html#stream_new_stream_readable_options
    super({ objectMode: true, emitClose: true, autoDestroy: true, highWaterMark: batchSize || highWaterMark })
    this.cursor = new Cursor(text, values, config)

    // delegate Submittable callbacks to cursor
    this.handleRowDescription = this.cursor.handleRowDescription.bind(this.cursor)
    this.handleDataRow = this.cursor.handleDataRow.bind(this.cursor)
    this.handlePortalSuspended = this.cursor.handlePortalSuspended.bind(this.cursor)
    this.handleCommandComplete = this.cursor.handleCommandComplete.bind(this.cursor)
    this.handleReadyForQuery = this.cursor.handleReadyForQuery.bind(this.cursor)
    this.handleError = this.cursor.handleError.bind(this.cursor)
    this.handleEmptyQuery = this.cursor.handleEmptyQuery.bind(this.cursor)
  }

  submit(connection) {
    this.cursor.submit(connection)
  }

  _destroy(_err, cb) {
    this.cursor.close((err) => {
      cb(err || _err)
    })
  }

  // https://nodejs.org/api/stream.html#stream_readable_read_size_1
  _read(size) {
    this.cursor.read(size, (err, rows, result) => {
      if (err) {
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

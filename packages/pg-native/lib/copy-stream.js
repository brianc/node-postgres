const Duplex = require('stream').Duplex
const Writable = require('stream').Writable
const util = require('util')

const CopyStream = (module.exports = function (pq, options) {
  Duplex.call(this, options)
  this.pq = pq
  this._reading = false
})

util.inherits(CopyStream, Duplex)

// writer methods
CopyStream.prototype._write = function (chunk, encoding, cb) {
  const result = this.pq.putCopyData(chunk)

  // sent successfully
  if (result === 1) return cb()

  // error
  if (result === -1) return cb(new Error(this.pq.errorMessage()))

  // command would block. wait for writable and call again.
  const self = this
  this.pq.writable(function () {
    self._write(chunk, encoding, cb)
  })
}

CopyStream.prototype.end = function () {
  const args = Array.prototype.slice.call(arguments, 0)
  const self = this

  const callback = args.pop()

  if (args.length) {
    this.write(args[0])
  }
  const result = this.pq.putCopyEnd()

  // sent successfully
  if (result === 1) {
    // consume our results and then call 'end' on the
    // "parent" writable class so we can emit 'finish' and
    // all that jazz
    return consumeResults(this.pq, function (err, res) {
      Writable.prototype.end.call(self)

      // handle possible passing of callback to end method
      if (callback) {
        callback(err)
      }
    })
  }

  // error
  if (result === -1) {
    const err = new Error(this.pq.errorMessage())
    return this.emit('error', err)
  }

  // command would block. wait for writable and call end again
  // don't pass any buffers to end on the second call because
  // we already sent them to possible this.write the first time
  // we called end
  return this.pq.writable(function () {
    return self.end.apply(self, callback)
  })
}

// reader methods
CopyStream.prototype._consumeBuffer = function (cb) {
  const result = this.pq.getCopyData(true)
  if (result instanceof Buffer) {
    return setImmediate(function () {
      cb(null, result)
    })
  }
  if (result === -1) {
    // end of stream
    return cb(null, null)
  }
  if (result === 0) {
    const self = this
    this.pq.once('readable', function () {
      self.pq.stopReader()
      self.pq.consumeInput()
      self._consumeBuffer(cb)
    })
    return this.pq.startReader()
  }
  cb(new Error('Unrecognized read status: ' + result))
}

CopyStream.prototype._read = function (size) {
  if (this._reading) return
  this._reading = true
  // console.log('read begin');
  const self = this
  this._consumeBuffer(function (err, buffer) {
    self._reading = false
    if (err) {
      return self.emit('error', err)
    }
    if (buffer === false) {
      // nothing to read for now, return
      return
    }
    self.push(buffer)
  })
}

const consumeResults = function (pq, cb) {
  const cleanup = function () {
    pq.removeListener('readable', onReadable)
    pq.stopReader()
  }

  const readError = function (message) {
    cleanup()
    return cb(new Error(message || pq.errorMessage()))
  }

  const onReadable = function () {
    // read waiting data from the socket
    // e.g. clear the pending 'select'
    if (!pq.consumeInput()) {
      return readError()
    }

    // check if there is still outstanding data
    // if so, wait for it all to come in
    if (pq.isBusy()) {
      return
    }

    // load our result object
    pq.getResult()

    // "read until results return null"
    // or in our case ensure we only have one result
    if (pq.getResult() && pq.resultStatus() !== 'PGRES_COPY_OUT') {
      return readError('Only one result at a time is accepted')
    }

    if (pq.resultStatus() === 'PGRES_FATAL_ERROR') {
      return readError()
    }

    cleanup()
    return cb(null)
  }
  pq.on('readable', onReadable)
  pq.startReader()
}

import type Libpq from 'libpq'
import { Duplex, type DuplexOptions, Writable } from 'node:stream'

type EndCallback = (err?: Error | null) => void

function consumeResults(pq: Libpq, cb: (err: Error | null) => void): void {
  const cleanup = (): void => {
    pq.removeListener('readable', onReadable)
    pq.stopReader()
  }

  const readError = (message?: string): void => {
    cleanup()
    cb(new Error(message || pq.errorMessage()))
  }

  const onReadable = (): void => {
    // read waiting data from the socket
    // e.g. clear the pending 'select'
    if (!pq.consumeInput()) {
      readError()
      return
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
      readError('Only one result at a time is accepted')
      return
    }

    if (pq.resultStatus() === 'PGRES_FATAL_ERROR') {
      readError()
      return
    }

    cleanup()
    cb(null)
  }

  pq.on('readable', onReadable)
  pq.startReader()
}

export class CopyStream extends Duplex {
  public pq: Libpq
  private _copyReading: boolean

  constructor(pq: Libpq, options?: DuplexOptions) {
    super(options)
    this.pq = pq
    this._copyReading = false
  }

  // writer methods
  override _write(chunk: unknown, encoding: BufferEncoding, cb: (err?: Error | null) => void): void {
    const buf = chunk as Buffer
    const result = this.pq.putCopyData(buf)

    // sent successfully
    if (result === 1) {
      cb()
      return
    }

    // error
    if (result === -1) {
      cb(new Error(this.pq.errorMessage()))
      return
    }

    // command would block. wait for writable and call again.
    this.pq.writable(() => {
      this._write(buf, encoding, cb)
    })
  }

  override end(cb?: EndCallback): this
  override end(chunk: unknown, cb?: EndCallback): this
  override end(chunk: unknown, encoding: BufferEncoding, cb?: EndCallback): this
  override end(chunkOrCb?: unknown, encodingOrCb?: BufferEncoding | EndCallback, cb?: EndCallback): this {
    let chunk: unknown
    let callback: EndCallback | undefined

    if (typeof chunkOrCb === 'function') {
      callback = chunkOrCb as EndCallback
    } else if (chunkOrCb !== undefined) {
      chunk = chunkOrCb
      if (typeof encodingOrCb === 'function') {
        callback = encodingOrCb
      } else if (typeof cb === 'function') {
        callback = cb
      }
    }

    if (chunk !== undefined) {
      this.write(chunk as Buffer)
    }

    const result = this.pq.putCopyEnd()

    // sent successfully
    if (result === 1) {
      // consume our results and then call 'end' on the
      // "parent" writable class so we can emit 'finish' and
      // all that jazz
      consumeResults(this.pq, (err) => {
        ;(Writable.prototype.end as (this: Writable) => void).call(this)
        if (callback) {
          callback(err)
        }
      })
      return this
    }

    // error
    if (result === -1) {
      const err = new Error(this.pq.errorMessage())
      this.emit('error', err)
      return this
    }

    // command would block. wait for writable and call end again
    // don't pass any buffers to end on the second call because
    // we already sent them to possible this.write the first time
    // we called end
    this.pq.writable(() => {
      if (callback) {
        this.end(callback)
      } else {
        this.end()
      }
    })
    return this
  }

  // reader methods
  private _consumeBuffer(cb: (err: Error | null, buffer?: Buffer | null) => void): void {
    const result = this.pq.getCopyData(true)
    if (result instanceof Buffer) {
      setImmediate(() => {
        cb(null, result)
      })
      return
    }
    if (result === -1) {
      // end of stream
      cb(null, null)
      return
    }
    if (result === 0) {
      this.pq.once('readable', () => {
        this.pq.stopReader()
        this.pq.consumeInput()
        this._consumeBuffer(cb)
      })
      this.pq.startReader()
      return
    }
    cb(new Error('Unrecognized read status: ' + result))
  }

  override _read(_size: number): void {
    if (this._copyReading) return
    this._copyReading = true
    this._consumeBuffer((err, buffer) => {
      this._copyReading = false
      if (err) {
        this.emit('error', err)
        return
      }
      // buffer is either a Buffer or null (signaling end of stream)
      this.push(buffer ?? null)
    })
  }
}

export default CopyStream

import { EventEmitter } from 'node:events'
import { Buffer } from 'node:buffer'

// Local shape of the workerd `cloudflare:sockets` module. The real module is only
// resolvable inside Cloudflare Workers; outside workerd this just keeps types
// consistent without requiring the @cloudflare/workers-types declarations.
interface Socket {
  readonly readable: ReadableStream<Uint8Array>
  readonly writable: WritableStream<Uint8Array>
  readonly closed: Promise<void>
  close(): Promise<void>
  startTls(options: TlsOptions): Socket
}

type TlsOptions = {
  expectedServerHostname?: string
}

type SocketAddress = {
  hostname: string
  port: number
}

type SocketOptions = {
  secureTransport?: 'off' | 'on' | 'starttls'
  allowHalfOpen?: boolean
}

interface CfSocketsModule {
  connect: (address: string | SocketAddress, options?: SocketOptions) => Socket
}

/**
 * Wrapper around the Cloudflare built-in socket that can be used by the `Connection`.
 */
export class CloudflareSocket extends EventEmitter {
  writable = false
  destroyed = false

  private _upgrading = false
  private _upgraded = false
  private _cfSocket: Socket | null = null
  private _cfWriter: WritableStreamDefaultWriter | null = null
  private _cfReader: ReadableStreamDefaultReader | null = null

  constructor(readonly ssl: boolean) {
    super()
  }

  setNoDelay(): this {
    return this
  }

  setKeepAlive(): this {
    return this
  }

  ref(): this {
    return this
  }

  unref(): this {
    return this
  }

  async connect(port: number, host: string, connectListener?: (...args: unknown[]) => void): Promise<this | undefined> {
    try {
      log('connecting')
      if (connectListener) this.once('connect', connectListener)

      const options: SocketOptions = this.ssl ? { secureTransport: 'starttls' } : {}
      const mod = (await import(/* @vite-ignore */ 'cloudflare:sockets' as string)) as CfSocketsModule
      const connect = mod.connect
      this._cfSocket = connect(`${host}:${port}`, options)
      this._cfWriter = this._cfSocket.writable.getWriter()
      this._addClosedHandler()

      this._cfReader = this._cfSocket.readable.getReader()
      if (this.ssl) {
        this._listenOnce().catch((e) => this.emit('error', e))
      } else {
        this._listen().catch((e) => this.emit('error', e))
      }

      await this._cfWriter.ready
      log('socket ready')
      this.writable = true
      this.emit('connect')

      return this
    } catch (e) {
      this.emit('error', e)
      return undefined
    }
  }

  async _listen(): Promise<void> {
    while (this._cfReader) {
      log('awaiting receive from CF socket')
      const { done, value } = await this._cfReader.read()
      log('CF socket received:', done, value)
      if (done) {
        log('done')
        break
      }
      this.emit('data', Buffer.from(value))
    }
  }

  async _listenOnce(): Promise<void> {
    log('awaiting first receive from CF socket')
    const { done, value } = await this._cfReader!.read()
    log('First CF socket received:', done, value)
    this.emit('data', Buffer.from(value))
  }

  write(
    data: Uint8Array | string,
    encoding: BufferEncoding = 'utf8',
    callback: (...args: unknown[]) => void = () => {}
  ): boolean {
    if (data.length === 0) {
      callback()
      return true
    }
    if (typeof data === 'string') data = Buffer.from(data, encoding)

    log('sending data direct:', data)
    this._cfWriter!.write(data).then(
      () => {
        log('data sent')
        callback()
      },
      (err) => {
        log('send error', err)
        callback(err)
      }
    )
    return true
  }

  end(
    data: Uint8Array | string = Buffer.alloc(0),
    encoding: BufferEncoding = 'utf8',
    callback: (...args: unknown[]) => void = () => {}
  ): this {
    log('ending CF socket')
    this.write(data, encoding, (err) => {
      this._cfSocket!.close()
      if (callback) callback(err)
    })
    return this
  }

  destroy(reason?: string): this {
    log('destroying CF socket', reason)
    this.destroyed = true
    return this.end()
  }

  startTls(options: TlsOptions): void {
    if (this._upgraded) {
      this.emit('error', 'Cannot call `startTls()` more than once on a socket')
      return
    }
    this._cfWriter!.releaseLock()
    this._cfReader!.releaseLock()
    this._upgrading = true
    this._cfSocket = this._cfSocket!.startTls(options)
    this._cfWriter = this._cfSocket.writable.getWriter()
    this._cfReader = this._cfSocket.readable.getReader()
    this._addClosedHandler()
    this._listen().catch((e) => this.emit('error', e))
  }

  _addClosedHandler(): void {
    this._cfSocket!.closed.then(() => {
      if (!this._upgrading) {
        log('CF socket closed')
        this._cfSocket = null
        this.emit('close')
      } else {
        this._upgrading = false
        this._upgraded = true
      }
    }).catch((e: unknown) => this.emit('error', e))
  }
}

const debug = false

function dump(data: unknown): unknown {
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    const hex = Buffer.from(data as Uint8Array).toString('hex')
    const str = new TextDecoder().decode(data as ArrayBuffer | Uint8Array)
    return `\n>>> STR: "${str.replace(/\n/g, '\\n')}"\n>>> HEX: ${hex}\n`
  } else {
    return data
  }
}

function log(...args: unknown[]): void {
  if (debug) console.log(...args.map(dump))
}

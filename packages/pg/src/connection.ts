import { EventEmitter } from 'node:events'
import * as net from 'node:net'

import { parse, serialize } from 'pg-protocol'

import { getSecureStream, getStream } from './stream.ts'

import type { Duplex } from './stream.ts'

const flushBuffer = serialize.flush()
const syncBuffer = serialize.sync()
const endBuffer = serialize.end()

export interface ConnectionConfig {
  stream?: Duplex | ((config: ConnectionConfig) => Duplex)
  ssl?: boolean | Record<string, unknown>
  keepAlive?: boolean
  keepAliveInitialDelayMillis?: number
  encoding?: string
  [key: string]: unknown
}

// TODO(bmc) support binary mode at some point
class Connection extends EventEmitter {
  stream: Duplex
  _keepAlive: boolean | undefined
  _keepAliveInitialDelayMillis: number | undefined
  parsedStatements: Record<string, string | undefined>
  ssl: boolean | Record<string, unknown>
  _ending: boolean
  _emitMessage: boolean
  _connecting?: boolean

  constructor(config?: ConnectionConfig) {
    super()
    const cfg: ConnectionConfig = config || {}

    let stream = cfg.stream || getStream(cfg.ssl)
    if (typeof stream === 'function') {
      stream = stream(cfg)
    }
    this.stream = stream as Duplex

    this._keepAlive = cfg.keepAlive
    this._keepAliveInitialDelayMillis = cfg.keepAliveInitialDelayMillis
    this.parsedStatements = {}
    this.ssl = cfg.ssl || false
    this._ending = false
    this._emitMessage = false
    this.on('newListener', (eventName: string) => {
      if (eventName === 'message') {
        this._emitMessage = true
      }
    })
  }

  connect(port: number | string, host?: string): void {
    this._connecting = true
    this.stream.setNoDelay?.(true)
    ;(this.stream.connect as (...args: unknown[]) => void)(port, host)

    this.stream.once('connect', () => {
      if (this._keepAlive) {
        this.stream.setKeepAlive?.(true, this._keepAliveInitialDelayMillis)
      }
      this.emit('connect')
    })

    const reportStreamError = (error: NodeJS.ErrnoException) => {
      // errors about disconnections should be ignored during disconnect
      if (this._ending && (error.code === 'ECONNRESET' || error.code === 'EPIPE')) {
        return
      }
      this.emit('error', error)
    }
    this.stream.on('error', reportStreamError)

    this.stream.on('close', () => {
      this.emit('end')
    })

    if (!this.ssl) {
      this.attachListeners(this.stream)
      return
    }

    this.stream.once('data', (buffer: Buffer) => {
      const responseCode = buffer.toString('utf8')
      switch (responseCode) {
        case 'S': // Server supports SSL connections, continue with a secure connection
          break
        case 'N': // Server does not support SSL connections
          this.stream.end()
          this.emit('error', new Error('The server does not support SSL connections'))
          return
        default:
          // Any other response byte, including 'E' (ErrorResponse) indicating a server error
          this.stream.end()
          this.emit('error', new Error('There was an error establishing an SSL connection'))
          return
      }
      const options: Record<string, unknown> = {
        socket: this.stream,
      }

      if (this.ssl !== true) {
        Object.assign(options, this.ssl)

        if (typeof this.ssl === 'object' && 'key' in this.ssl) {
          options.key = (this.ssl as { key: unknown }).key
        }
      }

      if (typeof host === 'string' && net.isIP && net.isIP(host) === 0) {
        options.servername = host
      }
      try {
        this.stream = getSecureStream(options as { socket: Duplex })
      } catch (err) {
        this.emit('error', err)
        return
      }
      this.attachListeners(this.stream)
      this.stream.on('error', reportStreamError)

      this.emit('sslconnect')
    })
  }

  attachListeners(stream: Duplex): void {
    parse(stream as unknown as NodeJS.ReadableStream, (msg) => {
      const eventName = msg.name === 'error' ? 'errorMessage' : msg.name
      if (this._emitMessage) {
        this.emit('message', msg)
      }
      this.emit(eventName, msg)
    })
  }

  requestSsl(): void {
    this.stream.write(serialize.requestSsl())
  }

  startup(config: Record<string, string>): void {
    this.stream.write(serialize.startup(config))
  }

  cancel(processID: number, secretKey: number): void {
    this._send(serialize.cancel(processID, secretKey))
  }

  password(password: string): void {
    this._send(serialize.password(password))
  }

  sendSASLInitialResponseMessage(mechanism: string, initialResponse: string): void {
    this._send(serialize.sendSASLInitialResponseMessage(mechanism, initialResponse))
  }

  sendSCRAMClientFinalMessage(additionalData: string): void {
    this._send(serialize.sendSCRAMClientFinalMessage(additionalData))
  }

  _send(buffer: Buffer): boolean {
    if (!(this.stream as unknown as { writable?: boolean }).writable) {
      return false
    }
    return this.stream.write(buffer)
  }

  query(text: string): void {
    this._send(serialize.query(text))
  }

  // send parse message
  parse(query: Parameters<typeof serialize.parse>[0]): void {
    this._send(serialize.parse(query))
  }

  // send bind message
  bind(config: Parameters<typeof serialize.bind>[0]): void {
    this._send(serialize.bind(config))
  }

  // send execute message
  execute(config: Parameters<typeof serialize.execute>[0]): void {
    this._send(serialize.execute(config))
  }

  flush(): void {
    if ((this.stream as unknown as { writable?: boolean }).writable) {
      this.stream.write(flushBuffer)
    }
  }

  sync(): void {
    this._ending = true
    this._send(syncBuffer)
  }

  ref(): void {
    this.stream.ref?.()
  }

  unref(): void {
    this.stream.unref?.()
  }

  end(): void | boolean {
    // 0x58 = 'X'
    this._ending = true
    if (!this._connecting || !(this.stream as unknown as { writable?: boolean }).writable) {
      this.stream.end()
      return
    }
    return this.stream.write(endBuffer, () => {
      this.stream.end()
    })
  }

  close(msg: Parameters<typeof serialize.close>[0]): void {
    this._send(serialize.close(msg))
  }

  describe(msg: Parameters<typeof serialize.describe>[0]): void {
    this._send(serialize.describe(msg))
  }

  sendCopyFromChunk(chunk: Buffer): void {
    this._send(serialize.copyData(chunk))
  }

  endCopyFrom(): void {
    this._send(serialize.copyDone())
  }

  sendCopyFail(msg: string): void {
    this._send(serialize.copyFail(msg))
  }
}

export default Connection
export { Connection }

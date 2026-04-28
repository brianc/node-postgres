// This is an empty module that is served up when outside of a workerd environment.
// See the `exports` field in package.json. It mirrors the public shape of `./index.ts`
// so that consumers can import `CloudflareSocket` regardless of the runtime, but any
// attempt to actually connect outside of Cloudflare Workers throws a clear error.

import { EventEmitter } from 'node:events'

const ERROR_MESSAGE = 'pg-cloudflare: CloudflareSocket is only available in a Cloudflare Workers (workerd) runtime.'

export class CloudflareSocket extends EventEmitter {
  writable = false
  destroyed = false

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

  async connect(_port: number, _host: string, _connectListener?: (...args: unknown[]) => void): Promise<this> {
    throw new Error(ERROR_MESSAGE)
  }

  write(
    _data: Uint8Array | string,
    _encoding: BufferEncoding = 'utf8',
    callback: (...args: unknown[]) => void = () => {}
  ): boolean {
    callback(new Error(ERROR_MESSAGE))
    return false
  }

  end(
    _data?: Uint8Array | string,
    _encoding?: BufferEncoding,
    callback: (...args: unknown[]) => void = () => {}
  ): this {
    callback(new Error(ERROR_MESSAGE))
    return this
  }

  destroy(_reason?: string): this {
    this.destroyed = true
    return this
  }

  startTls(_options: unknown): void {
    throw new Error(ERROR_MESSAGE)
  }
}

const _default: { CloudflareSocket: typeof CloudflareSocket } = { CloudflareSocket }
export default _default

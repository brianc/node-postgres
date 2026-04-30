// Stub module returned outside Cloudflare Workers (workerd).
// See `exports` in package.json — bundlers and Node both land here when
// the workerd condition isn't active. Mirrors the public shape of
// `./index.ts` so consumers can import the same named export from any
// runtime, but actually attempting to use it outside workerd throws.
//
// Kept dependency-free (no `node:events`) so bundlers like webpack/vite
// can include this file without polyfills or `node_compat` flags.

const ERROR = 'pg-cloudflare: CloudflareSocket is only available in a Cloudflare Workers (workerd) runtime.'

type Listener = (...args: unknown[]) => void

export class CloudflareSocket {
  ssl: boolean
  writable = false
  destroyed = false

  private _listeners = new Map<string, Listener[]>()

  constructor(ssl: boolean) {
    this.ssl = ssl
  }

  on(event: string, listener: Listener): this {
    const list = this._listeners.get(event) ?? []
    list.push(listener)
    this._listeners.set(event, list)
    return this
  }

  once(event: string, listener: Listener): this {
    return this.on(event, listener)
  }

  off(event: string, listener: Listener): this {
    const list = this._listeners.get(event)
    if (list)
      this._listeners.set(
        event,
        list.filter((l) => l !== listener)
      )
    return this
  }

  removeListener(event: string, listener: Listener): this {
    return this.off(event, listener)
  }

  emit(_event: string, ..._args: unknown[]): boolean {
    return false
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

  async connect(_port: number, _host: string, _connectListener?: Listener): Promise<this> {
    throw new Error(ERROR)
  }

  write(_data: Uint8Array | string, _encoding?: string, callback: Listener = () => {}): boolean {
    callback(new Error(ERROR))
    return false
  }

  end(_data?: Uint8Array | string, _encoding?: string, callback: Listener = () => {}): this {
    callback(new Error(ERROR))
    return this
  }

  destroy(_reason?: string): this {
    this.destroyed = true
    return this
  }

  startTls(_options: unknown): void {
    throw new Error(ERROR)
  }
}

const _default: { CloudflareSocket: typeof CloudflareSocket } = { CloudflareSocket }
export default _default

import * as net from 'node:net'
import * as tls from 'node:tls'

type Duplex = NodeJS.ReadWriteStream & {
  setNoDelay?: (enable?: boolean) => void
  setKeepAlive?: (enable?: boolean, initialDelay?: number) => void
  connect?: (...args: unknown[]) => void
  ref?: () => void
  unref?: () => void
  destroy?: (error?: Error) => void
}

interface StreamFuncs {
  /** Get a socket stream compatible with the current runtime environment. */
  getStream: (ssl?: unknown) => Duplex
  /** Get a TLS secured socket using the socket and other settings given in `options`. */
  getSecureStream: (options: SecureStreamOptions) => Duplex
}

interface SecureStreamOptions {
  socket: Duplex
  key?: unknown
  [key: string]: unknown
}

function getNodejsStreamFuncs(): StreamFuncs {
  return {
    getStream(): Duplex {
      return new net.Socket() as unknown as Duplex
    },
    getSecureStream(options: SecureStreamOptions): Duplex {
      return tls.connect(options as unknown as tls.ConnectionOptions) as unknown as Duplex
    },
  }
}

function getCloudflareStreamFuncs(): StreamFuncs {
  // Resolved synchronously by workerd — the `pg-cloudflare` package's exports
  // map only ships the real `CloudflareSocket` under the `workerd` condition,
  // so we deliberately avoid touching it from Node. Pull the binding via a
  // string-tagged dynamic require so node bundlers don't try to load it.
  const pkg = 'pg-cloudflare'
  const mod = (
    globalThis as unknown as { require?: (s: string) => { CloudflareSocket: new (ssl: boolean) => Duplex } }
  ).require?.(pkg)
  const CloudflareSocket = mod?.CloudflareSocket
  return {
    getStream(ssl?: unknown): Duplex {
      if (!CloudflareSocket) {
        throw new Error('pg-cloudflare: CloudflareSocket not available outside Cloudflare Workers')
      }
      return new CloudflareSocket(Boolean(ssl))
    },
    getSecureStream(options: SecureStreamOptions): Duplex {
      const sock = options.socket as Duplex & { startTls(opts: SecureStreamOptions): void }
      sock.startTls(options)
      return options.socket
    },
  }
}

/**
 * Are we running in a Cloudflare Worker?
 */
function isCloudflareRuntime(): boolean {
  // Since 2022-03-21 the `global_navigator` compatibility flag is on for
  // Cloudflare Workers which means that `navigator.userAgent` will be defined.
  const nav = (globalThis as unknown as { navigator?: { userAgent?: string } }).navigator
  if (typeof nav === 'object' && nav !== null && typeof nav.userAgent === 'string') {
    return nav.userAgent === 'Cloudflare-Workers'
  }
  // Fallback: check if the global Response constructor accepts a `cf` init field
  if (typeof Response === 'function') {
    const resp = new Response(null, { cf: { thing: true } } as unknown as ResponseInit)
    const cf = (resp as unknown as { cf?: { thing?: boolean } }).cf
    if (typeof cf === 'object' && cf !== null && cf.thing) {
      return true
    }
  }
  return false
}

function getStreamFuncs(): StreamFuncs {
  if (isCloudflareRuntime()) {
    return getCloudflareStreamFuncs()
  }
  return getNodejsStreamFuncs()
}

const funcs = getStreamFuncs()

export const getStream: StreamFuncs['getStream'] = funcs.getStream
export const getSecureStream: StreamFuncs['getSecureStream'] = funcs.getSecureStream

export type { Duplex, SecureStreamOptions, StreamFuncs }

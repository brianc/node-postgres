// Ambient declarations for test-only dependencies that ship without first-class
// TypeScript types.

declare module 'concat-stream' {
  import { Writable } from 'node:stream'

  // The runtime callback receives whatever the underlying chunks resolve to
  // (Buffer, string, or array). Tests pin a concrete type via the generic
  // parameter so the callback's `data` arg is precisely typed at the call-site.
  function concat<T = Buffer | string | unknown[]>(callback: (data: T) => void): Writable
  function concat<T = Buffer | string | unknown[]>(
    opts: { encoding?: 'buffer' | 'string' | 'array' | 'object' | 'uint8array' },
    callback: (data: T) => void
  ): Writable
  export = concat
}

declare module 'JSONStream' {
  import { Duplex } from 'node:stream'
  export function parse(pattern?: unknown): Duplex
  export function stringify(...args: unknown[]): Duplex
}

declare module 'stream-spec' {
  interface PausableSpec {
    pausable(opts?: { strict?: boolean }): { validateOnExit(): void }
  }
  function spec(stream?: unknown): {
    through(): PausableSpec
    readable(): PausableSpec
  }
  export = spec
}

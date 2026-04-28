import { createRequire } from 'node:module'

import RawPool from 'pg-pool'
import * as types from 'pg-types'

import { DatabaseError } from 'pg-protocol'

import Client from './client.ts'
import Connection from './connection.ts'
import defaults from './defaults.ts'
import Pool from './pool.ts'
import Query from './query.ts'
import Result from './result.ts'
import TypeOverrides from './type-overrides.ts'
import * as utils from './utils.ts'
import { escapeIdentifier, escapeLiteral } from './utils.ts'

export {
  Client,
  Connection,
  DatabaseError,
  defaults,
  escapeIdentifier,
  escapeLiteral,
  Pool,
  Query,
  Result,
  types,
  TypeOverrides,
  utils,
}

const requireFn = createRequire(import.meta.url)

interface PG {
  defaults: typeof defaults
  Client: typeof Client
  Query: typeof Query
  Pool: typeof Pool
  _pools: unknown[]
  Connection: typeof Connection
  types: typeof types
  DatabaseError: typeof DatabaseError
  TypeOverrides: typeof TypeOverrides
  escapeIdentifier: typeof escapeIdentifier
  escapeLiteral: typeof escapeLiteral
  Result: typeof Result
  utils: typeof utils
  native: PG | null
}

function buildPg(ClientCtor: typeof Client): PG {
  // Wrap the raw pg-pool Pool so it binds to the supplied Client (default pg.Client
  // or the native client when accessed via `pg.native`).
  const BasePool = RawPool as unknown as new (
    options: ConstructorParameters<typeof RawPool>[0],
    Client?: typeof Client
  ) => RawPool
  class BoundPool extends BasePool {
    constructor(options?: ConstructorParameters<typeof RawPool>[0]) {
      super(options as never, ClientCtor)
    }
  }
  return {
    defaults,
    Client: ClientCtor,
    Query: (ClientCtor as unknown as { Query: typeof Query }).Query,
    Pool: BoundPool as unknown as typeof Pool,
    _pools: [],
    Connection,
    types,
    DatabaseError,
    TypeOverrides,
    escapeIdentifier,
    escapeLiteral,
    Result,
    utils,
    native: null,
  }
}

let clientConstructor: typeof Client = Client

let forceNative = false
try {
  forceNative = !!process.env.NODE_PG_FORCE_NATIVE
} catch {
  // ignore, e.g., Deno without --allow-env
}

if (forceNative) {
  const mod = requireFn('./native/index.js') as { default?: typeof Client; Client?: typeof Client }
  clientConstructor = mod.default || mod.Client || (mod as unknown as typeof Client)
}

const pg: PG = buildPg(clientConstructor)

// Lazy native binding accessor; returns null if `pg-native` is not installed.
Object.defineProperty(pg, 'native', {
  configurable: true,
  enumerable: false,
  get(): PG | null {
    let nativePg: PG | null = null
    try {
      const mod = requireFn('./native/index.js') as { default?: typeof Client; Client?: typeof Client }
      const NativeClient = mod.default || mod.Client || (mod as unknown as typeof Client)
      nativePg = buildPg(NativeClient)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'MODULE_NOT_FOUND' && code !== 'ERR_MODULE_NOT_FOUND') {
        throw err
      }
    }

    Object.defineProperty(pg, 'native', { value: nativePg, configurable: false, enumerable: false, writable: false })
    return nativePg
  },
})

export default pg

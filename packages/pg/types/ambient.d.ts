// Ambient types for upstream packages without first-class TypeScript declarations.

declare module '@cloudflare/vitest-pool-workers/config' {
  export function defineWorkersConfig(config: unknown): unknown
}

declare module 'pg-types' {
  export type TypeFormat = 'text' | 'binary'
  export type TypeParser<T = unknown> = (value: string | Buffer) => T

  export function getTypeParser(oid: number, format?: TypeFormat): TypeParser
  export function setTypeParser(oid: number, format: TypeFormat, parser: TypeParser): void
  export function setTypeParser(oid: number, parser: TypeParser): void

  export const builtins: Record<string, number>
  export const arrayParser: { create: (...args: unknown[]) => unknown }
}

declare module 'pgpass' {
  export interface PgPassConfig {
    host?: string
    port?: number | string
    user?: string
    database?: string
    [key: string]: unknown
  }

  function pgPass(config: PgPassConfig, cb: (password: string | undefined) => void): void
  export default pgPass
}

declare module 'pg-native' {
  export default class PgNative {
    constructor(opts?: unknown)
    pq: { resultErrorFields(): Record<string, string> | null | undefined }
    arrayMode: boolean
    connect(connectionString: string, cb: (err?: Error) => void): void
    end(cb?: () => void): void
    query(text: string, cb: (err: Error | undefined, rows: unknown[], results: unknown) => void): void
    query(
      text: string,
      values: unknown[],
      cb: (err: Error | undefined, rows: unknown[], results: unknown) => void
    ): void
    prepare(name: string, text: string, length: number, cb: (err?: Error) => void): void
    execute(
      name: string,
      values: unknown[],
      cb: (err: Error | undefined, rows: unknown[], results: unknown) => void
    ): void
    cancel(cb: (err?: Error) => void): void
    on(event: 'error', listener: (err: Error) => void): this
    on(event: 'notification', listener: (msg: { relname: string; extra: string }) => void): this
  }
}

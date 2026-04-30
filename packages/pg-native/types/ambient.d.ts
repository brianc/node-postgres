// Minimal ambient types for CJS native modules used by pg-native.
// These are not full type definitions - just enough to cover what we use.

declare module 'libpq' {
  import type { EventEmitter } from 'node:events'

  type ConnectCallback = (err?: Error | null) => void
  type WritableCallback = () => void

  class Libpq extends EventEmitter {
    constructor()

    connect(params?: string | ConnectCallback, cb?: ConnectCallback): void
    connectSync(params?: string): void
    finish(): void

    // sync exec
    exec(text: string): void
    execParams(text: string, values: unknown[]): void
    prepare(name: string, text: string, nParams: number): void
    execPrepared(name: string, parameters: unknown[]): void

    // async send
    sendQuery(text: string): boolean
    sendQueryParams(text: string, values: unknown[]): boolean
    sendPrepare(name: string, text: string, nParams: number): boolean
    sendQueryPrepared(name: string, parameters: unknown[]): boolean

    // I/O
    setNonBlocking(value: boolean): boolean
    flush(): number
    consumeInput(): boolean
    isBusy(): boolean
    writable(cb: WritableCallback): void
    startReader(): void
    stopReader(): void

    // results
    getResult(): boolean
    resultStatus(): string
    resultErrorMessage(): string
    resultErrorFields(): Record<string, string>
    cmdStatus(): string
    cmdTuples(): string
    nfields(): number
    ntuples(): number
    fname(index: number): string
    ftype(index: number): number
    getvalue(rowIndex: number, colIndex: number): string
    getisnull(rowIndex: number, colIndex: number): boolean

    // misc
    errorMessage(): string
    cancel(): boolean | string
    notifies(): { channel: string; payload?: string; relname?: string } | undefined
    escapeLiteral(value: string): string
    escapeIdentifier(value: string): string

    // copy
    putCopyData(chunk: Buffer): number
    putCopyEnd(): number
    getCopyData(async: boolean): Buffer | number
  }

  export default Libpq
}

declare module 'pg-types' {
  export type TypeParser = (value: string) => unknown
  export function getTypeParser(oid: number, format?: string): TypeParser
  const _default: { getTypeParser: typeof getTypeParser }
  export default _default
}

import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'

import Connection from '../../../src/connection.ts'
import helper, { Client } from '../../_test-helper.ts'

import type { ClientConfig } from '../../../src/client.ts'

export * from '../../_test-helper.ts'
export { Connection }

// In-memory stand-in for a TCP socket. Captures every write so tests can inspect
// the wire bytes the client sent.
export class MemoryStream extends EventEmitter {
  packets: Buffer[] = []
  closed = false
  writable = true

  connect(): void {}

  setNoDelay(): void {}

  write(packet: Buffer, cb?: () => void): boolean {
    this.packets.push(packet)
    if (cb) cb()
    return true
  }

  end(): void {
    this.closed = true
  }

  setKeepAlive(): void {}
}

export function createClient(): InstanceType<typeof Client> {
  const stream = new MemoryStream()
  const client = new Client({
    connection: new Connection({ stream: stream as unknown as never }),
  })
  client.connect(() => {})
  return client
}

// Mirrors the legacy `helper.client(config)` factory: spins up a Client with a
// stubbed Connection so unit tests can drive the state machine synchronously.
export function client(
  config?: ClientConfig
): InstanceType<typeof Client> & { connection: Connection & { queries: string[] } } {
  const connection = new Connection({ stream: 'no' as unknown as never })
  ;(connection as unknown as { startup: () => void }).startup = () => {}
  ;(connection as unknown as { connect: () => void }).connect = () => {}
  ;(connection as unknown as { queries: string[] }).queries = []
  ;(connection as unknown as { query: (text: string) => void }).query = function (
    this: { queries: string[] },
    text: string
  ): void {
    this.queries.push(text)
  }
  const c = new Client({ connection, ...config })
  c.connect(() => {})
  c.connection.emit('connect')
  return c as never
}

export default { ...helper, createClient, MemoryStream, Connection, client }

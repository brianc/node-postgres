import assert from 'node:assert'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, it } from 'vitest'

import { Client } from '../../_test-helper.ts'
import { createClient, MemoryStream } from './_test-helper.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('cleartext password', () => {
  it('responds with password', () => {
    const client = createClient()
    ;(client as unknown as { password: string }).password = '!'
    const stream = (client.connection as unknown as { stream: MemoryStream }).stream
    stream.packets = []
    client.connection.emit('authenticationCleartextPassword')
    const packets = stream.packets
    assert.equal(packets.length, 1)
    const packet = packets[0]
    assert.deepEqual(Array.from(packet), [0x70, 0, 0, 0, 6, 33, 0])
  })

  it('does not crash with null password using pg-pass', () => {
    process.env.PGPASSFILE = `${__dirname}/pgpass.file`
    const client = new Client({
      host: 'foo',
      port: 5432,
      database: 'bar',
      user: 'baz',
      stream: new MemoryStream() as unknown as never,
    })
    client.connect(() => {})
    client.connection.emit('authenticationCleartextPassword')
    // smoke test — we just need to not throw
    assert.ok(true)
    // satisfy unused buffer imports
    void Buffer.alloc(0)
  })
})

import assert from 'node:assert'
import { Buffer } from 'node:buffer'

import { describe, it } from 'vitest'

import * as crypto from '../../../src/crypto/utils.ts'
import BufferList from '../../_buffer-list.ts'
import { createClient, MemoryStream } from './_test-helper.ts'

describe('md5 authentication', () => {
  it('responds with hashed password', async () => {
    const client = createClient()
    ;(client as unknown as { password: string }).password = '!'
    const salt = Buffer.from([1, 2, 3, 4])
    client.connection.emit('authenticationMD5Password', { salt })

    // Wait a tick for the async password handler
    await new Promise((r) => setImmediate(r))

    const stream = (client.connection as unknown as { stream: MemoryStream }).stream
    assert.equal(stream.packets.length, 1)

    const password = await crypto.postgresMd5PasswordHash(client.user!, client.password as string, salt)
    const expected = new BufferList().addCString(password).join(true, 'p')
    assert.deepEqual(Array.from(stream.packets[0]), Array.from(expected))
  })

  it('md5 of utf-8 strings', async () => {
    assert.equal(await crypto.md5('😊'), '5deda34cd95f304948d2bc1b4a62c11e')
  })
})

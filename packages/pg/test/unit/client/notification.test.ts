import assert from 'node:assert'

import { it } from 'vitest'

import { createClient } from './_test-helper.ts'

it('passes connection notification', () =>
  new Promise<void>((resolve) => {
    const client = createClient()
    client.once('notice', (msg) => {
      assert.equal(msg, 'HAY!!')
      resolve()
    })
    client.connection.emit('notice', 'HAY!!')
  }))

import assert from 'node:assert'
import * as net from 'node:net'

import { it } from 'vitest'

import pg from '../../../src/index.ts'

it('early disconnect surfaces error to client.connect callback', () =>
  new Promise<void>((resolve, reject) => {
    const server = net.createServer((c) => {
      c.destroy()
      server.close()
    })

    server.listen(7777, () => {
      const client = new pg.Client('postgres://localhost:7777')
      client.connect((err) => {
        try {
          assert(err)
          resolve()
        } catch (e) {
          reject(e)
        }
      })
    })
  }))

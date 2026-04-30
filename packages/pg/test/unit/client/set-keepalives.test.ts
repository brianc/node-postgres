import assert from 'node:assert'
import * as net from 'node:net'

import { it } from 'vitest'

import pg from '../../../src/index.ts'

it('setting keep alive', () =>
  new Promise<void>((resolve, reject) => {
    const server = net.createServer((c) => {
      c.destroy()
      server.close()
    })

    server.listen(7777, () => {
      const stream = new net.Socket()
      ;(stream as unknown as { setKeepAlive: (e: boolean, d: number) => void }).setKeepAlive = (
        enable,
        initialDelay
      ) => {
        try {
          assert(enable === true)
          assert(initialDelay === 10000)
          resolve()
        } catch (e) {
          reject(e)
        }
      }

      const client = new pg.Client({
        host: 'localhost',
        port: 7777,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
        stream: stream as unknown as never,
      })

      client.connect().catch(() => {})
    })
  }))

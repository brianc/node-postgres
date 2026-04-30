import assert from 'node:assert'
import { describe, it } from 'vitest'
import Client from '../src/index.ts'

describe('cancel query', () => {
  it('works', () =>
    new Promise<void>((resolve, reject) => {
      const client = new Client()
      client.connectSync()
      client.query('SELECT pg_sleep(1000);', (err) => {
        try {
          assert(err instanceof Error)
        } catch (e) {
          return reject(e as Error)
        }
        client.end(() => resolve())
      })
      setTimeout(() => {
        client.cancel((err) => {
          if (err) reject(err)
        })
      }, 100)
    }))

  it('does not raise error if no active query', () =>
    new Promise<void>((resolve, reject) => {
      const client = new Client()
      client.connectSync()
      client.cancel((err) => {
        if (err) return reject(err)
        resolve()
      })
    }))

  it('raises error if client is not connected', () =>
    new Promise<void>((resolve) => {
      new Client().cancel((err) => {
        assert(err, 'should raise an error when not connected')
        resolve()
      })
    }))
})

import assert from 'node:assert'
import { describe, it } from 'vitest'
import Client from '../src/index.ts'

describe('many errors', () => {
  it('functions properly without segfault', async () => {
    const throwError = (): Promise<void> =>
      new Promise((resolve, reject) => {
        const client = new Client()
        client.connectSync()

        let i = 0
        const next = (): void => {
          if (i >= 10) {
            client.end((err) => (err ? reject(err) : resolve()))
            return
          }
          i++
          client.query('select asdfiasdf', (err) => {
            assert(err, 'bad query should emit an error')
            next()
          })
        }
        next()
      })

    await Promise.all(Array.from({ length: 10 }, () => throwError()))
  })
})

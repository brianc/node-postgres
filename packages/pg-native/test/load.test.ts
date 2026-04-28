import { describe, it } from 'vitest'
import Client from '../src/index.ts'

function execute(): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = new Client()
    client.connectSync()
    let i = 0
    const next = (): void => {
      if (i >= 5) {
        client.end()
        resolve()
        return
      }
      client.query('SELECT $1::int as num', [i++], (err) => {
        if (err) return reject(err)
        next()
      })
    }
    next()
  })
}

describe('Load tests', () => {
  it('single client and many queries', async () => {
    await execute()
  })

  it('multiple client and many queries', async () => {
    await Promise.all(Array.from({ length: 20 }, () => execute()))
  })
})

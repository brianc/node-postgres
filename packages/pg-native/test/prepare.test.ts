import { describe, it } from 'vitest'
import Client from '../src/index.ts'

describe('async prepare', () => {
  const run = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const client = new Client()
      client.connectSync()

      let i = 0
      const next = (): void => {
        if (i >= 10) {
          client.end((err) => (err ? reject(err) : resolve()))
          return
        }
        client.prepare('get_now' + i++, 'SELECT NOW()', 0, (err) => {
          if (err) return reject(err)
          next()
        })
      }
      next()
    })

  for (let i = 0; i < 10; i++) {
    const n = i
    it('works for ' + n + ' clients', async () => {
      await Promise.all(Array.from({ length: n }, () => run()))
    })
  }
})

describe('async execute', () => {
  const run = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const client = new Client()
      client.connectSync()
      client.prepareSync('get_now', 'SELECT NOW()', 0)
      let i = 0
      const next = (): void => {
        if (i >= 10) {
          client.end((err) => (err ? reject(err) : resolve()))
          return
        }
        i++
        client.execute('get_now', [], (err) => {
          if (err) return reject(err)
          next()
        })
      }
      next()
    })

  for (let i = 0; i < 10; i++) {
    const n = i
    it('works for ' + n + ' clients', async () => {
      await Promise.all(Array.from({ length: n }, () => run()))
    })
  }
})

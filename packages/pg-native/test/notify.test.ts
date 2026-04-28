import { afterAll, beforeAll, describe, it } from 'vitest'
import Client from '../src/index.ts'

function notify(channel: string, payload: string): void {
  const client = new Client()
  client.connectSync()
  client.querySync('NOTIFY ' + channel + ", '" + payload + "'")
  client.end()
}

describe('simple LISTEN/NOTIFY', () => {
  let client: Client

  beforeAll(
    () =>
      new Promise<void>((resolve, reject) => {
        client = new Client()
        client.connect((err) => (err ? reject(err) : resolve()))
      })
  )

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        client.end(() => resolve())
      })
  )

  it('works', () =>
    new Promise<void>((resolve) => {
      client.querySync('LISTEN boom')
      client.on('notification', () => {
        resolve()
      })
      notify('boom', 'sup')
    }))
})

if (!process.env.TRAVIS_CI) {
  describe('async LISTEN/NOTIFY', () => {
    let client: Client

    beforeAll(
      () =>
        new Promise<void>((resolve, reject) => {
          client = new Client()
          client.connect((err) => (err ? reject(err) : resolve()))
        })
    )

    afterAll(
      () =>
        new Promise<void>((resolve) => {
          client.end(() => resolve())
        })
    )

    it('works', () =>
      new Promise<void>((resolve, reject) => {
        let count = 0
        const check = (): void => {
          count++
          if (count >= 2) resolve()
        }
        client.on('notification', check)
        client.query('LISTEN test', (err) => {
          if (err) return reject(err)
          notify('test', 'bot')
          client.query('SELECT pg_sleep(.05)', (err2) => {
            if (err2) return reject(err2)
            notify('test', 'bot')
          })
        })
      }))
  })
}

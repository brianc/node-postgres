import assert from 'node:assert'
import { afterAll, beforeAll, describe, it } from 'vitest'
import Client from '../src/index.ts'

describe('huge async query', () => {
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
      let payload = ''
      const len = 100000
      for (let i = 0; i < len; i++) {
        payload += 'A'
      }
      const qText = "SELECT '" + payload + "'::text as my_text"
      client.query(qText, (err, rows) => {
        if (err) return reject(err)
        const r = rows as Array<Record<string, string>>
        assert.equal(r[0]!.my_text.length, len)
        resolve()
      })
    }))
})

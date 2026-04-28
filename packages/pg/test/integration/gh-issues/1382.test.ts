import { describe, it } from 'vitest'
import assert from 'node:assert'
import helper from './../_test-helper.ts'

describe('1382', () => {
  it('calling end during active query should return a promise', () =>
    new Promise<void>((done) => {
      const client = new helper.pg.Client()
      let callCount = 0
      // ensure both the query rejects and the end promise resolves
      const after = () => {
        if (++callCount > 1) {
          done()
        }
      }
      client.connect().then(() => {
        client.query('SELECT NOW()').catch(after)
        client.end().then(after)
      })
    }))

  it('calling end during an active query should call end callback', () =>
    new Promise<void>((done) => {
      const client = new helper.pg.Client()
      let callCount = 0
      // ensure both the query rejects and the end callback fires
      const after = () => {
        if (++callCount > 1) {
          done()
        }
      }
      client.connect().then(() => {
        client.query('SELECT NOW()').catch(after)
        client.end(after)
      })
    }))
})

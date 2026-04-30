import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'

describe('promise-api', () => {
  const pg = helper.pg
  it('valid connection completes promise', () => {
    const client = new pg.Client()
    return client.connect().then(() => {
      return client.end().then(() => {})
    })
  })

  it('valid connection completes promise', () => {
    const client = new pg.Client()
    return client.connect().then(() => {
      return client.end().then(() => {})
    })
  })

  it('valid connection returns the client in a promise', () => {
    const client = new pg.Client()
    return client.connect().then((clientInside) => {
      assert.equal(client, clientInside)
      return client.end().then(() => {})
    })
  })

  it('invalid connection rejects promise', () =>
    new Promise<void>((done) => {
      const client = new pg.Client({ host: 'alksdjflaskdfj', port: 1234 })
      return client.connect().catch((e) => {
        assert(e instanceof Error)
        done()
      })
    }))

  it('connected client does not reject promise after connection', () =>
    new Promise<void>((done) => {
      const client = new pg.Client()
      return client.connect().then(() => {
        setTimeout(() => {
          client.on('error', (e) => {
            assert(e instanceof Error)
            client.end()
            done()
          })
          // manually kill the connection
          client.emit('error', new Error('something bad happened...but not really'))
        }, 50)
      })
    }))
})

import { describe, it } from 'vitest'
import assert from 'node:assert'
import helper from './../_test-helper.ts'

describe('1854', () => {
  it('Parameter serialization errors should not cause query to hang', () =>
    new Promise<void>((done) => {
      if (helper.config.native) {
        // pg-native cannot handle non-string parameters so skip this entirely
        return done()
      }
      const client = new helper.pg.Client()
      const expectedErr = new Error('Serialization error')
      client
        .connect()
        .then(() => {
          const obj = {
            toPostgres: function () {
              throw expectedErr
            },
          }
          return client.query('SELECT $1::text', [obj]).then(() => {
            throw new Error('Expected a serialization error to be thrown but no error was thrown')
          })
        })
        .catch((err) => {
          client.end(() => {})
          if (err !== expectedErr) {
            done(new Error('Expected a serialization error to be thrown but instead caught: ' + err) as never)
            return
          }
          done()
        })
    }))
})

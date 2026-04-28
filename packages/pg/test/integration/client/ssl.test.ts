import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'

describe('ssl', () => {
  it('can connect with ssl', () =>
    new Promise<void>((done) => {
      const config = {
        ...helper.config,
        ssl: {
          rejectUnauthorized: false,
        },
      }
      const client = new helper.pg.Client(config)
      client.connect(
        assert.success(function () {
          client.query(
            'SELECT NOW()',
            assert.success(function () {
              client.end(done)
            })
          )
        })
      )
    }))
})

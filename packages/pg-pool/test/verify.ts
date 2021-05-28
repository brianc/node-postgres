import Pool from '../'
import assert from 'assert'

describe('verify', () => {
  it('verifies a client with a callback', (done) => {
    const pool = new Pool({
      verify: (client, cb) => {
        cb(new Error('nope'))
      },
    })

    pool.connect((err, client) => {
      assert.ok(err instanceof Error)
      assert.strictEqual(err.message, 'nope')
      pool.end()
      done()
    })
  })
})

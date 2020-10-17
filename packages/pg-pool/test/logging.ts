import Pool from '../'
import assert from 'assert'

describe('logging', function () {
  it('logs to supplied log function if given', function () {
    const messages = []
    const log = function (msg) {
      messages.push(msg)
    }
    const pool = new Pool({ log: log })
    return pool.query('SELECT NOW()').then(function () {
      assert.notEqual(messages.length, 0, 'Expected to have messages')
      return pool.end()
    })
  })
})

const Pool = require('../')

const expect = require('expect.js')

describe('disposable clients', () => {
  it('defines a callable [Symbol.dispose]() when symbol is present', async () => {
    const pool = new Pool({ max: 1 })
    const client = await pool.connect()

    if (Symbol.dispose) {
      expect(client[Symbol.dispose]).to.be.a('function')
    }

    // ensure we don't define an `undefined` function when Symbol.dispose
    // doesn't exist
    expect(client).not.to.have.property('undefined')

    client.release()
    await pool.end()
  })

  if (process.version.slice(1).split('.')[0] >= 24) {
    require('./disposable-clients/using.js')
  }
})

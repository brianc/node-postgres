const describe = require('mocha').describe
const it = require('mocha').it
const expect = require('expect.js')

const Pool = require('..')

describe('lifecycle hooks', () => {
  it('are called on connect', async () => {
    const pool = new Pool({
      hooks: {
        connect: (client) => {
          client.HOOK_CONNECT_COUNT = (client.HOOK_CONNECT_COUNT || 0) + 1
        },
      },
    })
    const client = await pool.connect()
    expect(client.HOOK_CONNECT_COUNT).to.equal(1)
    client.release()
    const client2 = await pool.connect()
    expect(client).to.equal(client2)
    expect(client2.HOOK_CONNECT_COUNT).to.equal(1)
    client.release()
    await pool.end()
  })
})

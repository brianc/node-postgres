const Pool = require('../..')

const expect = require('expect.js')

it('supports releasing clients via `using`', async () => {
  const pool = new Pool({ max: 1 })
  expect(pool.totalCount).to.eql(0)

  {
    using client = await pool.connect()
    expect(pool.totalCount).to.eql(1)
    expect(pool.idleCount).to.eql(0)
    await client.query('SELECT NOW()')
  }

  expect(pool.totalCount).to.eql(1)
  expect(pool.idleCount).to.eql(1)

  await pool.end()
})

it('supports destroying clients via `using`', async () => {
  const pool = new Pool({ max: 1 })
  expect(pool.totalCount).to.eql(0)

  {
    using client = await pool.connect()
    client.destroyOnDispose = true
    expect(pool.totalCount).to.eql(1)
    expect(pool.idleCount).to.eql(0)
    await client.query('SELECT NOW()')
  }

  expect(pool.totalCount).to.eql(0)
  expect(pool.idleCount).to.eql(0)

  await pool.end()
})

const describe = require('mocha').describe
const it = require('mocha').it
const expect = require('expect.js')

const Pool = require('..')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// the assertions below look at the pool while queries are in flight, so open the
// first connection up front and keep connecting out of the measured window
const warm = async (options) => {
  const pool = new Pool(options)
  await pool.query('SELECT 1')
  return pool
}

describe('pipeline', () => {
  it('sends a query on a connection that is already working', async () => {
    const pool = await warm({ max: 1, pipeline: true })
    const slow = pool.query('SELECT pg_sleep(0.3)')
    const fast = pool.query('SELECT 1 AS num')
    await wait(50)

    expect(pool.waitingCount).to.equal(0)
    expect(pool.totalCount).to.equal(1)
    expect((await fast).rows[0].num).to.equal(1)

    await slow
    await pool.end()
  })

  it('opens connections up to max before pipelining', async () => {
    const pool = await warm({ max: 3, pipeline: true })
    const queries = [1, 2, 3, 4, 5, 6].map((num) => pool.query('SELECT pg_sleep(0.2), $1::int AS num', [num]))
    await wait(50)

    expect(pool.totalCount).to.equal(3)
    expect(pool.waitingCount).to.equal(0)

    const results = await Promise.all(queries)
    expect(results.map((res) => res.rows[0].num)).to.eql([1, 2, 3, 4, 5, 6])
    await pool.end()
  })

  it('does not send more than maxPipeline on one connection', async () => {
    const pool = await warm({ max: 1, maxPipeline: 2, pipeline: true })
    const queries = [1, 2, 3, 4, 5].map((num) => pool.query('SELECT pg_sleep(0.1), $1::int AS num', [num]))
    await wait(50)

    expect(pool.waitingCount).to.equal(3)

    const results = await Promise.all(queries)
    expect(results.map((res) => res.rows[0].num)).to.eql([1, 2, 3, 4, 5])
    await pool.end()
  })

  it('gives pool.connect a connection nobody else is using', async () => {
    const pool = await warm({ max: 1, pipeline: true })
    const query = pool.query('SELECT pg_sleep(0.2)')
    await wait(50)

    let checkedOut = false
    const checkout = pool.connect().then((client) => {
      checkedOut = true
      client.release()
    })
    await wait(50)
    expect(checkedOut).to.equal(false)

    await query
    await checkout
    expect(checkedOut).to.equal(true)
    await pool.end()
  })

  it('keeps the connection after a query error', async () => {
    const pool = await warm({ max: 1, pipeline: true })
    const bad = pool.query('SELECT * FROM table_that_does_not_exist')
    const good = pool.query('SELECT 1 AS num')

    await bad.then(
      () => {
        throw new Error('expected the query to fail')
      },
      (err) => expect(err.message).to.contain('table_that_does_not_exist')
    )
    expect((await good).rows[0].num).to.equal(1)
    expect(pool.totalCount).to.equal(1)

    expect((await pool.query('SELECT 2 AS num')).rows[0].num).to.equal(2)
    await pool.end()
  })

  it('reports a broken connection to every query on it', async () => {
    const pool = new Pool({ max: 1, pipeline: true })
    let client
    pool.once('connect', (c) => (client = c))
    await pool.query('SELECT 1')

    const queries = [1, 2, 3].map(() => pool.query('SELECT pg_sleep(0.2)'))
    await wait(50)
    client.connection.stream.destroy()

    const results = await Promise.allSettled(queries)
    expect(results.map((res) => res.status)).to.eql(['rejected', 'rejected', 'rejected'])
    expect(pool.totalCount).to.equal(0)

    expect((await pool.query('SELECT 1 AS num')).rows[0].num).to.equal(1)
    await pool.end()
  })

  it('waits for the queries in flight on end', async () => {
    const pool = await warm({ max: 1, pipeline: true })
    const queries = [1, 2, 3].map((num) => pool.query('SELECT pg_sleep(0.1), $1::int AS num', [num]))
    await wait(50)
    expect(pool.waitingCount).to.equal(0)

    await pool.end()
    const results = await Promise.all(queries)
    expect(results.map((res) => res.rows[0].num)).to.eql([1, 2, 3])
  })
})

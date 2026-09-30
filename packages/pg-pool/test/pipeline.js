const path = require('path')
const { fork } = require('child_process')
const Cursor = require('pg-cursor')
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
    const pool = await warm({ max: 1, maxPipeline: 10 })
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
    const pool = await warm({ max: 3, maxPipeline: 10 })
    const queries = [1, 2, 3, 4, 5, 6].map((num) => pool.query('SELECT pg_sleep(0.2), $1::int AS num', [num]))
    await wait(50)

    expect(pool.totalCount).to.equal(3)
    expect(pool.waitingCount).to.equal(0)

    const results = await Promise.all(queries)
    expect(results.map((res) => res.rows[0].num)).to.eql([1, 2, 3, 4, 5, 6])
    await pool.end()
  })

  it('does not send more than maxPipeline on one connection', async () => {
    const pool = await warm({ max: 1, maxPipeline: 2 })
    const queries = [1, 2, 3, 4, 5].map((num) => pool.query('SELECT pg_sleep(0.1), $1::int AS num', [num]))
    await wait(50)

    expect(pool.waitingCount).to.equal(3)

    const results = await Promise.all(queries)
    expect(results.map((res) => res.rows[0].num)).to.eql([1, 2, 3, 4, 5])
    await pool.end()
  })

  it('answers every query of a large burst', async () => {
    const pool = await warm({ max: 2, maxPipeline: 10 })
    const nums = Array.from({ length: 500 }, (_, i) => i)
    const results = await Promise.all(nums.map((num) => pool.query('SELECT $1::int AS num', [num])))

    expect(results.map((res) => res.rows[0].num)).to.eql(nums)
    expect(pool.totalCount).to.equal(2)
    await pool.end()
  })

  it('accepts the callback and the values forms', async () => {
    const pool = new Pool({ max: 1, maxPipeline: 10 })
    const withValues = await new Promise((resolve, reject) => {
      pool.query('SELECT $1::int AS num', [7], (err, res) => (err ? reject(err) : resolve(res)))
    })
    const withoutValues = await new Promise((resolve, reject) => {
      pool.query('SELECT 8 AS num', (err, res) => (err ? reject(err) : resolve(res)))
    })

    expect(withValues.rows[0].num).to.equal(7)
    expect(withoutValues.rows[0].num).to.equal(8)
    await pool.end()
  })

  it('pipelines named prepared statements', async () => {
    const pool = await warm({ max: 1, maxPipeline: 10 })
    const nums = Array.from({ length: 20 }, (_, i) => i)
    const results = await Promise.all(
      nums.map((num) => pool.query({ name: 'pipeline-test', text: 'SELECT $1::int AS num', values: [num] }))
    )

    expect(results.map((res) => res.rows[0].num)).to.eql(nums)
    await pool.end()
  })

  it('keeps the connection when a query is rejected before it is written', async () => {
    const pool = await warm({ max: 1, maxPipeline: 10 })
    await pool.query({ text: 'SELECT $1::int', values: 'not an array' }).then(
      () => {
        throw new Error('expected the query to fail')
      },
      (err) => expect(err.message).to.contain('must be an array')
    )

    expect((await pool.query('SELECT 1 AS num')).rows[0].num).to.equal(1)
    expect(pool.totalCount).to.equal(1)
    expect(pool.idleCount).to.equal(1)
    await pool.end()
  })

  it('delivers the right rows to the queries behind a failed write', async () => {
    const circular = {}
    circular.self = circular
    const pool = await warm({ max: 1, maxPipeline: 10 })
    const slow = pool.query('SELECT pg_sleep(0.2)')
    const bad = pool.query('SELECT $1::text AS bad', [circular])
    const third = pool.query('SELECT 333 AS num')
    const fourth = pool.query('SELECT 444 AS num')

    await bad.then(
      () => {
        throw new Error('expected the query to fail')
      },
      (err) => expect(err.message).to.contain('circular')
    )
    expect((await third).rows).to.eql([{ num: 333 }])
    expect((await fourth).rows).to.eql([{ num: 444 }])
    await slow
    await pool.end()
  })

  it('rotates the connection on maxLifetimeSeconds under constant load', async function () {
    this.timeout(5000)
    const pool = await warm({ max: 1, maxLifetimeSeconds: 1, maxPipeline: 10 })
    const pids = new Set()
    const until = Date.now() + 2500
    while (Date.now() < until) {
      const res = await pool.query('SELECT pg_backend_pid() AS pid, pg_sleep(0.02)')
      pids.add(res.rows[0].pid)
    }

    expect(pids.size).to.be.greaterThan(1)
    await pool.end()
  })

  it('stays usable when a query fails while it is being written', async () => {
    const circular = {}
    circular.self = circular
    const pool = await warm({ max: 1, maxPipeline: 10 })
    await pool.query('SELECT $1::text', [circular]).then(
      () => {
        throw new Error('expected the query to fail')
      },
      (err) => expect(err.message).to.contain('circular')
    )

    expect((await pool.query('SELECT 1 AS num')).rows[0].num).to.equal(1)
    await pool.end()
  })

  it('refuses a submittable instead of holding the connection', async () => {
    const pool = await warm({ max: 1, maxPipeline: 10 })
    await pool.query(new Cursor('SELECT * FROM generate_series(0, 10)')).then(
      () => {
        throw new Error('expected the query to be refused')
      },
      (err) => expect(err.message).to.contain('pool.connect()')
    )

    expect((await pool.query('SELECT 1 AS num')).rows[0].num).to.equal(1)
    expect(pool.idleCount).to.equal(1)
    await pool.end()
  })

  it('waits for the queries in flight when maxUses drops the connection', async () => {
    const pool = new Pool({ max: 1, maxUses: 1, maxPipeline: 10 })
    const query = pool.query('SELECT pg_sleep(0.3), 1 AS num')
    await wait(60)

    const started = Date.now()
    await pool.end()
    expect(Date.now() - started).to.be.greaterThan(150)
    expect((await query).rows[0].num).to.equal(1)
  })

  it('does not hold more connections than max while recycling', async () => {
    const application_name = 'pipeline-recycle-test'
    const spy = new Pool({ max: 1 })
    const pool = new Pool({ max: 2, maxUses: 3, maxPipeline: 10, application_name })
    const count = async () => {
      const res = await spy.query('SELECT count(*)::int AS c FROM pg_stat_activity WHERE application_name = $1', [
        application_name,
      ])
      return res.rows[0].c
    }

    let peak = 0
    const watch = setInterval(() => count().then((c) => (peak = Math.max(peak, c))), 10)
    for (let round = 0; round < 5; round++) {
      await Promise.all(Array.from({ length: 4 }, () => pool.query('SELECT pg_sleep(0.1)')))
    }
    clearInterval(watch)

    expect(peak).to.be.lessThan(3)
    await pool.end()
    await spy.end()
  })

  it('recycles connections on maxUses while pipelining', async () => {
    const pool = await warm({ max: 1, maxUses: 3, maxPipeline: 10 })
    const removed = []
    pool.on('remove', () => removed.push(1))

    const nums = Array.from({ length: 10 }, (_, i) => i)
    const results = await Promise.all(nums.map((num) => pool.query('SELECT $1::int AS num', [num])))
    expect(results.map((res) => res.rows[0].num)).to.eql(nums)

    await wait(100)
    expect(removed.length).to.be.greaterThan(1)
    await pool.end()
  })

  it('answers in order on a single connection', async () => {
    const pool = await warm({ max: 1, maxPipeline: 100 })
    const nums = Array.from({ length: 100 }, (_, i) => i)
    const order = []
    await Promise.all(
      nums.map((num) => pool.query('SELECT $1::int AS num', [num]).then((res) => order.push(res.rows[0].num)))
    )

    expect(order).to.eql(nums)
    await pool.end()
  })

  it('runs the connection hooks once per connection, not per query', async () => {
    let connects = 0
    let verifies = 0
    const pool = new Pool({
      max: 2,
      maxPipeline: 10,
      onConnect: (client) => client.query("SET application_name = 'pipeline-test'").then(() => connects++),
      verify: (client, cb) => {
        verifies++
        cb()
      },
    })
    const nums = Array.from({ length: 20 }, (_, i) => i)
    const results = await Promise.all(nums.map((num) => pool.query('SELECT $1::int AS num', [num])))

    expect(results.map((res) => res.rows[0].num)).to.eql(nums)
    expect(connects).to.equal(pool.totalCount)
    expect(verifies).to.equal(pool.totalCount)
    expect((await pool.query('SHOW application_name')).rows[0].application_name).to.equal('pipeline-test')
    await pool.end()
  })

  it('times out a query that waits too long for a connection', async () => {
    const pool = await warm({ max: 1, maxPipeline: 2, connectionTimeoutMillis: 60 })
    const slow = Promise.all([pool.query('SELECT pg_sleep(0.3)'), pool.query('SELECT pg_sleep(0.3)')])
    await pool.query('SELECT 1 AS num').then(
      () => {
        throw new Error('expected the query to time out')
      },
      (err) => expect(err.message).to.contain('timeout exceeded')
    )

    await slow
    expect((await pool.query('SELECT 2 AS num')).rows[0].num).to.equal(2)
    expect(pool.waitingCount).to.equal(0)
    await pool.end()
  })

  it('rotates a pipelining connection on maxLifetimeSeconds', async () => {
    const pool = await warm({ max: 1, maxLifetimeSeconds: 1, maxPipeline: 10 })
    const first = await pool.query('SELECT pg_backend_pid() AS pid')
    await wait(1400)
    const second = await pool.query('SELECT pg_backend_pid() AS pid')

    expect(second.rows[0].pid).to.not.equal(first.rows[0].pid)
    await pool.end()
  })

  it('spreads queries over the connection with the fewest in flight', async () => {
    const pool = await warm({ max: 2, maxPipeline: 10 })
    // occupy both connections once so they are both open and idle
    await Promise.all([pool.query('SELECT pg_sleep(0.05)'), pool.query('SELECT pg_sleep(0.05)')])

    const results = await Promise.all(
      Array.from({ length: 6 }, () => pool.query('SELECT pg_backend_pid() AS pid, pg_sleep(0.15)'))
    )
    const perPid = {}
    results.forEach((res) => (perPid[res.rows[0].pid] = (perPid[res.rows[0].pid] || 0) + 1))

    expect(Object.values(perPid)).to.eql([3, 3])
    await pool.end()
  })

  it('emits acquire and release once per query', async () => {
    const pool = await warm({ max: 2, maxPipeline: 10 })
    let acquires = 0
    let releases = 0
    pool.on('acquire', () => acquires++)
    pool.on('release', () => releases++)

    await Promise.all(Array.from({ length: 10 }, (_, i) => pool.query('SELECT $1::int AS num', [i])))
    expect(acquires).to.equal(10)
    expect(releases).to.equal(10)
    await pool.end()
  })

  it('rejects the query when the connection cannot be made', async () => {
    const pool = new Pool({ port: 1, host: 'localhost', maxPipeline: 10, connectionTimeoutMillis: 2000 })
    await pool.query('SELECT 1').then(
      () => {
        throw new Error('expected the query to fail')
      },
      (err) => expect(err).to.be.an(Error)
    )
    expect(pool.totalCount).to.equal(0)
    await pool.end()
  })

  it('rejects the query when the verify hook fails', async () => {
    const pool = new Pool({ maxPipeline: 10, verify: (client, cb) => cb(new Error('verify says no')) })
    await pool.query('SELECT 1').then(
      () => {
        throw new Error('expected the query to fail')
      },
      (err) => expect(err.message).to.equal('verify says no')
    )
    expect(pool.totalCount).to.equal(0)
    await pool.end()
  })

  it('keeps a transaction on a connection of its own', async () => {
    const pool = await warm({ max: 2, maxPipeline: 10 })
    const client = await pool.connect()
    await client.query('BEGIN')
    const inside = await client.query('SELECT pg_backend_pid() AS pid')

    const outside = await Promise.all([
      pool.query('SELECT pg_backend_pid() AS pid'),
      pool.query('SELECT pg_backend_pid() AS pid'),
    ])
    expect(outside.map((res) => res.rows[0].pid)).to.not.contain(inside.rows[0].pid)

    await client.query('COMMIT')
    client.release()
    await pool.end()
  })

  it('gives pool.connect a connection nobody else is using', async () => {
    const pool = await warm({ max: 1, maxPipeline: 10 })
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
    const pool = await warm({ max: 1, maxPipeline: 10 })
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

  it('removes a connection that goes idle after a long query', async () => {
    const pool = await warm({ max: 1, idleTimeoutMillis: 100, maxPipeline: 10 })
    await pool.query('SELECT pg_sleep(0.15)')
    expect(pool.totalCount).to.equal(1)

    await wait(250)
    expect(pool.totalCount).to.equal(0)
    await pool.end()
  })

  it('reports a broken connection to every query on it', async () => {
    const pool = new Pool({ max: 1, maxPipeline: 10 })
    let client
    const poolErrors = []
    pool.once('connect', (c) => (client = c))
    pool.on('error', (err) => poolErrors.push(err))
    await pool.query('SELECT 1')

    const queries = [1, 2, 3].map(() => pool.query('SELECT pg_sleep(0.2)'))
    await wait(50)
    client.connection.stream.destroy()

    const results = await Promise.allSettled(queries)
    expect(results.map((res) => res.status)).to.eql(['rejected', 'rejected', 'rejected'])
    expect(pool.totalCount).to.equal(0)
    // the queries got the error on their own callbacks, the pool must not repeat it
    expect(poolErrors).to.have.length(0)

    expect((await pool.query('SELECT 1 AS num')).rows[0].num).to.equal(1)
    await pool.end()
  })

  it('removes a client only once when it dies while waiting for removal', async () => {
    const pool = new Pool({ max: 1, maxUses: 1, maxPipeline: 10 })
    let client
    const removed = []
    pool.once('connect', (c) => (client = c))
    pool.on('remove', (c) => removed.push(c))

    const queries = [1, 2].map(() => pool.query('SELECT pg_sleep(0.3)'))
    await wait(100)
    // released once, so maxUses already marked it for removal with the query in flight
    client.connection.stream.destroy()

    await Promise.allSettled(queries)
    await wait(100)
    expect(removed.filter((c) => c === client).length).to.equal(1)

    expect((await pool.query('SELECT 1 AS num')).rows[0].num).to.equal(1)
    await pool.end()
  })

  it('lets the program exit when allowExitOnIdle is set', function (done) {
    const child = fork(path.join(__dirname, 'idle-timeout-exit.js'), [], {
      stdio: ['ignore', 'pipe', 'inherit', 'ipc'],
      env: { ...process.env, ALLOW_EXIT_ON_IDLE: '1', PIPELINE: '1' },
    })
    let result = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => (result += chunk))
    child.on('error', done)
    child.on('exit', (exitCode) => {
      expect(exitCode).to.equal(0)
      expect(result).to.equal('completed first\ncompleted second\n')
      done()
    })
  })

  it('waits for the queries in flight on end', async () => {
    const pool = await warm({ max: 1, maxPipeline: 10 })
    const queries = [1, 2, 3].map((num) => pool.query('SELECT pg_sleep(0.1), $1::int AS num', [num]))
    await wait(50)
    expect(pool.waitingCount).to.equal(0)

    await pool.end()
    const results = await Promise.all(queries)
    expect(results.map((res) => res.rows[0].num)).to.eql([1, 2, 3])
  })
})

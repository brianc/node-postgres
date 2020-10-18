import net from 'net'
import assert from 'assert'
import Pool from '../'

describe('connection timeout', () => {
  const connectionFailure = new Error('Temporary connection failure')

  let server
  let port
  before((done) => {
    server = net.createServer((socket) => {
      socket.on('data', () => {
        // discard any buffered data or the server wont terminate
      })
    })

    server.listen(() => {
      port = server.address().port
      done()
    })
  })

  after((done) => {
    server.close(done)
  })

  it('should callback with an error if timeout is passed', (done) => {
    const pool = new Pool({ connectionTimeoutMillis: 10, port: port, host: 'localhost' })
    pool.connect((err, client, release) => {
      assert.ok(err instanceof Error)
      assert.ok(err.message.includes('timeout'))
      assert.strictEqual(client, undefined)
      assert.strictEqual(pool.idleCount, 0)
      done()
    })
  })

  it('should reject promise with an error if timeout is passed', (done) => {
    const pool = new Pool({ connectionTimeoutMillis: 10, port: port, host: 'localhost' })
    pool.connect().catch((err) => {
      assert.ok(err instanceof Error)
      assert.ok(err.message.includes('timeout'))
      assert.strictEqual(pool.idleCount, 0)
      done()
    })
  })

  it('should handle multiple timeouts', async () => {
    const errors = []
    const pool = new Pool({ connectionTimeoutMillis: 1, port: port, host: 'localhost' })
    for (var i = 0; i < 15; i++) {
      try {
        await pool.connect()
      } catch (e) {
        errors.push(e)
      }
    }
    assert.strictEqual(errors.length, 15)
  })

  it('should timeout on checkout of used connection', (done) => {
    const pool = new Pool({ connectionTimeoutMillis: 100, max: 1 })
    pool.connect((err, client, release) => {
      assert.strictEqual(err, undefined)
      assert.notStrictEqual(client, undefined)
      pool.connect((err, client) => {
        assert.ok(err instanceof Error)
        assert.strictEqual(client, undefined)
        release()
        pool.end(done)
      })
    })
  })

  it('should not break further pending checkouts on a timeout', (done) => {
    const pool = new Pool({ connectionTimeoutMillis: 200, max: 1 })
    pool.connect((err, client, releaseOuter) => {
      assert.strictEqual(err, undefined)

      pool.connect((err, client) => {
        assert.ok(err instanceof Error)
        assert.strictEqual(client, undefined)
        releaseOuter()
      })

      setTimeout(() => {
        pool.connect((err, client, releaseInner) => {
          assert.strictEqual(err, undefined)
          assert.notStrictEqual(client, undefined)
          releaseInner()
          pool.end(done)
        })
      }, 100)
    })
  })

  it('should timeout on query if all clients are busy', (done) => {
    const pool = new Pool({ connectionTimeoutMillis: 100, max: 1 })
    pool.connect((err, client, release) => {
      assert.strictEqual(err, undefined)
      assert.notStrictEqual(client, undefined)
      pool.query('select now()', (err, result) => {
        assert.ok(err instanceof Error)
        assert.strictEqual(result, undefined)
        release()
        pool.end(done)
      })
    })
  })

  it('should recover from timeout errors', (done) => {
    const pool = new Pool({ connectionTimeoutMillis: 100, max: 1 })
    pool.connect((err, client, release) => {
      assert.strictEqual(err, undefined)
      assert.notStrictEqual(client, undefined)
      pool.query('select now()', (err, result) => {
        assert.ok(err instanceof Error)
        assert.strictEqual(result, undefined)
        release()
        pool.query('select $1::text as name', ['brianc'], (err, res) => {
          assert.strictEqual(err, undefined)
          assert.strictEqual(res.rows.length, 1)
          pool.end(done)
        })
      })
    })
  })

  it('continues processing after a connection failure', (done) => {
    const Client = require('pg').Client
    const orgConnect = Client.prototype.connect
    let called = false

    Client.prototype.connect = function (cb) {
      // Simulate a failure on first call
      if (!called) {
        called = true

        return setTimeout(() => {
          cb(connectionFailure)
        }, 100)
      }
      // And pass-through the second call
      orgConnect.call(this, cb)
    }

    const pool = new Pool({
      Client: Client,
      connectionTimeoutMillis: 1000,
      max: 1,
    })

    pool.connect((err, client, release) => {
      assert.strictEqual(err, connectionFailure)

      pool.query('select $1::text as name', ['brianc'], (err, res) => {
        assert.strictEqual(err, undefined)
        assert.strictEqual(res.rows.length, 1)
        pool.end(done)
      })
    })
  })

  it('releases newly connected clients if the queued already timed out', (done) => {
    const Client = require('pg').Client

    const orgConnect = Client.prototype.connect

    let connection = 0

    Client.prototype.connect = function (cb) {
      // Simulate a failure on first call
      if (connection === 0) {
        connection++

        return setTimeout(() => {
          cb(connectionFailure)
        }, 300)
      }

      // And second connect taking > connection timeout
      if (connection === 1) {
        connection++

        return setTimeout(() => {
          orgConnect.call(this, cb)
        }, 1000)
      }

      orgConnect.call(this, cb)
    }

    const pool = new Pool({
      Client: Client,
      connectionTimeoutMillis: 1000,
      max: 1,
    })

    // Direct connect
    pool.connect((err, client, release) => {
      assert.strictEqual(err, connectionFailure)
    })

    // Queued
    let called = 0
    pool.connect((err, client, release) => {
      // Verify the callback is only called once
      assert.strictEqual(called++, 0)
      assert.ok(err instanceof Error)

      pool.query('select $1::text as name', ['brianc'], (err, res) => {
        assert.strictEqual(err, undefined)
        assert.strictEqual(res.rows.length, 1)
        pool.end(done)
      })
    })
  })
})

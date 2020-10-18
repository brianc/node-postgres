import assert from 'assert'
import net, { AddressInfo } from 'net'
import Pool from '../'

describe('pool error handling', function () {
  it('Should complete these queries without dying', function (done) {
    const pool = new Pool()
    let errors = 0
    let shouldGet = 0
    function runErrorQuery() {
      shouldGet++
      return new Promise(function (resolve, reject) {
        pool
          .query("SELECT 'asd'+1 ")
          .then(function (res) {
            reject(res) // this should always error
          })
          .catch(function (err) {
            errors++
            resolve(err)
          })
      })
    }
    const ps = []
    for (let i = 0; i < 5; i++) {
      ps.push(runErrorQuery())
    }
    Promise.all(ps).then(function () {
      assert.deepStrictEqual(shouldGet, errors)
      pool.end(done)
    })
  })

  describe('calling release more than once', () => {
    it('should throw each time', async () => {
      const pool = new Pool()
      const client = await pool.connect()
      client.release()
      assert.throws(() => client.release())
      assert.throws(() => client.release())
      await pool.end()
    })

    it('should throw each time with callbacks', (done) => {
      const pool = new Pool()

      pool.connect(function (err, client, clientDone) {
        assert.strictEqual(err instanceof Error, false)
        clientDone()

        assert.throws(() => clientDone())
        assert.throws(() => clientDone())

        pool.end(done)
      })
    })
  })

  describe('using an ended pool', () => {
    it('rejects all additional promises', (done) => {
      const pool = new Pool()
      const promises = []
      pool.end().then(() => {
        const squash = (promise) => promise.catch((e) => 'okay!')
        promises.push(squash(pool.connect()))
        promises.push(squash(pool.query('SELECT NOW()')))
        promises.push(squash(pool.end()))
        Promise.all(promises).then((res) => {
          assert.deepStrictEqual(res, ['okay!', 'okay!', 'okay!'])
          done()
        })
      })
    })

    it('returns an error on all additional callbacks', (done) => {
      const pool = new Pool()
      pool.end(() => {
        pool.query('SELECT *', (err) => {
          assert.ok(err instanceof Error)
          pool.connect((err) => {
            assert.ok(err instanceof Error)
            pool.end((err) => {
              assert.ok(err instanceof Error)
              done()
            })
          })
        })
      })
    })
  })

  describe('error from idle client', () => {
    it('removes client from pool', async () => {
      const pool = new Pool()
      const client = await pool.connect()
      assert.strictEqual(pool.totalCount, 1)
      assert.strictEqual(pool.waitingCount, 0)
      assert.strictEqual(pool.idleCount, 0)
      client.release()
      await new Promise((resolve, reject) => {
        process.nextTick(() => {
          let poolError
          pool.once('error', (err) => {
            poolError = err
          })

          let clientError
          client.once('error', (err) => {
            clientError = err
          })

          client.emit('error', new Error('expected'))

          assert.strictEqual(clientError.message, 'expected')
          assert.strictEqual(poolError.message, 'expected')
          assert.strictEqual(pool.idleCount, 0)
          assert.strictEqual(pool.totalCount, 0)
          pool.end().then(resolve, reject)
        })
      })
    })
  })

  describe('error from in-use client', () => {
    it('keeps the client in the pool', async () => {
      const pool = new Pool()
      const client = await pool.connect()
      assert.strictEqual(pool.totalCount, 1)
      assert.strictEqual(pool.waitingCount, 0)
      assert.strictEqual(pool.idleCount, 0)

      await new Promise((resolve, reject) => {
        process.nextTick(() => {
          let poolError
          pool.once('error', (err) => {
            poolError = err
          })

          let clientError
          client.once('error', (err) => {
            clientError = err
          })

          client.emit('error', new Error('expected'))

          assert.strictEqual(clientError.message, 'expected')
          assert.ok(poolError)
          assert.strictEqual(pool.idleCount, 0)
          assert.strictEqual(pool.totalCount, 1)
          client.release()
          pool.end().then(resolve, reject)
        })
      })
    })
  })

  describe('passing a function to pool.query', () => {
    it('calls back with error', (done) => {
      const pool = new Pool()
      console.log('passing fn to query')
      pool.query((err) => {
        assert.ok(err instanceof Error)
        pool.end(done)
      })
    })
  })

  describe('pool with lots of errors', () => {
    it('continues to work and provide new clients', async () => {
      const pool = new Pool({ max: 1 })
      const errors = []
      for (var i = 0; i < 20; i++) {
        try {
          await pool.query('invalid sql')
        } catch (err) {
          errors.push(err)
        }
      }
      assert.strictEqual(errors.length, 20)
      assert.strictEqual(pool.idleCount, 0)
      assert.ok(pool.query instanceof Function)
      const res = await pool.query('SELECT $1::text as name', ['brianc'])
      assert.strictEqual(res.rows.length, 1)
      assert.strictEqual(res.rows[0].name, 'brianc')
      return pool.end()
    })
  })

  it('should continue with queued items after a connection failure', (done) => {
    const closeServer = net
      .createServer((socket) => {
        socket.destroy()
      })
      .unref()

    closeServer.listen(() => {
      const pool = new Pool({ max: 1, port: (closeServer.address() as AddressInfo).port, host: 'localhost' })
      pool.connect((err) => {
        assert.ok(err instanceof Error)
        // @ts-expect-error
        if (err.code) {
          // @ts-expect-error
          assert.strictEqual(err.code, 'ECONNRESET')
        }
      })
      pool.connect((err) => {
        assert.ok(err instanceof Error)
        // @ts-expect-error
        if (err.code) {
          // @ts-expect-error
          assert.strictEqual(err.code, 'ECONNRESET')
        }
        closeServer.close(() => {
          pool.end(done)
        })
      })
    })
  })

  it('handles post-checkout client failures in pool.query', (done) => {
    const pool = new Pool({ max: 1 })
    pool.on('error', () => {
      // We double close the connection in this test, prevent exception caused by that
    })
    pool.query('SELECT pg_sleep(5)', [], (err) => {
      assert.ok(err instanceof Error)
      done()
    })

    setTimeout(() => {
      pool._clients[0].end()
    }, 1000)
  })
})

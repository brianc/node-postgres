import assert from 'assert'
import Pool from '../'

describe('pool', function () {
  describe('with callbacks', function () {
    it('works totally un-configured', (done) => {
      const pool = new Pool()
      pool.connect(function (err, client, release) {
        if (err) return done(err)
        client.query('SELECT NOW()', function (err, res) {
          release()
          if (err) return done(err)
          assert.strictEqual(res.rows.length, 1)
          pool.end(done)
        })
      })
    })

    it('passes props to clients', (done) => {
      const pool = new Pool({ binary: true })
      pool.connect(function (err, client, release) {
        release()
        if (err) return done(err)
        assert.strictEqual(client.binary, true)
        pool.end(done)
      })
    })

    it('can run a query with a callback without parameters', (done) => {
      const pool = new Pool()
      pool.query('SELECT 1 as num', function (err, res) {
        assert.deepStrictEqual(res.rows[0], { num: 1 })
        pool.end(function () {
          done(err)
        })
      })
    })

    it('can run a query with a callback', (done) => {
      const pool = new Pool()
      pool.query('SELECT $1::text as name', ['brianc'], function (err, res) {
        assert.deepStrictEqual(res.rows[0], { name: 'brianc' })
        pool.end(function () {
          done(err)
        })
      })
    })

    it('passes connection errors to callback', (done) => {
      const pool = new Pool({ port: 53922 })
      pool.query('SELECT $1::text as name', ['brianc'], function (err, res) {
        assert.strictEqual(res, undefined)
        assert.ok(err instanceof Error)
        // a connection error should not pollute the pool with a dead client
        assert.strictEqual(pool.totalCount, 0)
        pool.end(function (err) {
          done(err)
        })
      })
    })

    it('does not pass client to error callback', (done) => {
      const pool = new Pool({ port: 58242 })
      pool.connect(function (err, client, release) {
        assert.ok(err instanceof Error)
        assert.strictEqual(client, undefined)
        assert.ok(release instanceof Function)
        pool.end(done)
      })
    })

    it('removes client if it errors in background', (done) => {
      const pool = new Pool()
      pool.connect(function (err, client, release) {
        release()
        if (err) return done(err)
        client.testString = 'foo'
        setTimeout(function () {
          client.emit('error', new Error('on purpose'))
        }, 10)
      })
      pool.on('error', function (err) {
        assert.strictEqual(err.message, 'on purpose')
        assert.notStrictEqual(err.client, undefined)
        assert.strictEqual(err.client.testString, 'foo')
        err.client.connection.stream.on('end', function () {
          pool.end(done)
        })
      })
    })

    it('should not change given options', (done) => {
      const options = { max: 10 }
      const pool = new Pool(options)
      pool.connect(function (err, client, release) {
        release()
        if (err) return done(err)
        assert.strictEqual(options, { max: 10 })
        pool.end(done)
      })
    })

    it('does not create promises when connecting', (done) => {
      const pool = new Pool()
      const returnValue = pool.connect(function (err, client, release) {
        release()
        if (err) return done(err)
        pool.end(done)
      })
      assert.strictEqual(returnValue, undefined)
    })

    it('does not create promises when querying', (done) => {
      const pool = new Pool()
      const returnValue = pool.query('SELECT 1 as num', function (err) {
        pool.end(function () {
          done(err)
        })
      })
      assert.strictEqual(returnValue, undefined)
    })

    it('does not create promises when ending', (done) => {
      const pool = new Pool()
      const returnValue = pool.end(done)
      assert.strictEqual(returnValue, undefined)
    })

    it('never calls callback syncronously', (done) => {
      const pool = new Pool()
      pool.connect((err, client) => {
        if (err) throw err
        client.release()
        setImmediate(() => {
          let called = false
          pool.connect((err, client) => {
            if (err) throw err
            called = true
            client.release()
            setImmediate(() => {
              pool.end(done)
            })
          })
          assert.strictEqual(called, false)
        })
      })
    })
  })

  describe('with promises', function () {
    it('connects, queries, and disconnects', function () {
      const pool = new Pool()
      return pool.connect().then(function (client) {
        return client.query('select $1::text as name', ['hi']).then(function (res) {
          assert.deepStrictEqual(res.rows, [{ name: 'hi' }])
          client.release()
          return pool.end()
        })
      })
    })

    it('executes a query directly', () => {
      const pool = new Pool()
      return pool.query('SELECT $1::text as name', ['hi']).then((res) => {
        assert.strictEqual(res.rows.length, 1)
        assert.strictEqual(res.rows[0].name, 'hi')
        return pool.end()
      })
    })

    it('properly pools clients', function () {
      const pool = new Pool({ poolSize: 9 })
      const promises = new Array(30).map(() => {
        return pool.connect().then((client) => {
          return client.query('select $1::text as name', ['hi']).then(function (res) {
            client.release()
            return res
          })
        })
      })
      return Promise.all(promises).then(function (res) {
        assert.strictEqual(res.length, 30)
        assert.strictEqual(pool.totalCount, 9)
        return pool.end()
      })
    })

    it('supports just running queries', function () {
      const pool = new Pool({ poolSize: 9 })
      const text = 'select $1::text as name'
      const values = ['hi']
      const query = { text: text, values: values }
      const promises = new Array(30).map(() => pool.query(query))
      return Promise.all(promises).then(function (queries) {
        assert.strictEqual(queries.length, 0)
        return pool.end()
      })
    })

    it('recovers from query errors', function () {
      const pool = new Pool()

      const errors = []
      const promises = new Array(30).map(() => {
        return pool.query('SELECT asldkfjasldkf').catch(function (e) {
          errors.push(e)
        })
      })
      return Promise.all(promises).then(() => {
        assert.strictEqual(errors.length, 30)
        assert.strictEqual(pool.totalCount, 0)
        assert.strictEqual(pool.idleCount, 0)
        return pool.query('SELECT $1::text as name', ['hi']).then(function (res) {
          assert.strictEqual(res.rows, [{ name: 'hi' }])
          return pool.end()
        })
      })
    })
  })
})

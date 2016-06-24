var expect = require('expect.js')
var co = require('co')
var _ = require('lodash')

var describe = require('mocha').describe
var it = require('mocha').it

var Pool = require('../')

describe('pool', function () {
  describe('with callbacks', function () {
    it('works totally unconfigured', function (done) {
      const pool = new Pool()
      pool.connect(function (err, client, release) {
        if (err) return done(err)
        client.query('SELECT NOW()', function (err, res) {
          release()
          if (err) return done(err)
          expect(res.rows).to.have.length(1)
          pool.end(done)
        })
      })
    })

    it('passes props to clients', function (done) {
      const pool = new Pool({ binary: true })
      pool.connect(function (err, client, release) {
        release()
        if (err) return done(err)
        expect(client.binary).to.eql(true)
        pool.end(done)
      })
    })

    it('can run a query with a callback without parameters', function (done) {
      const pool = new Pool()
      pool.query('SELECT 1 as num', function (err, res) {
        expect(res.rows[0]).to.eql({ num: 1 })
        pool.end(function () {
          done(err)
        })
      })
    })

    it('can run a query with a callback', function (done) {
      const pool = new Pool()
      pool.query('SELECT $1::text as name', ['brianc'], function (err, res) {
        expect(res.rows[0]).to.eql({ name: 'brianc' })
        pool.end(function () {
          done(err)
        })
      })
    })

    it('removes client if it errors in background', function (done) {
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
        expect(err.message).to.be('on purpose')
        expect(err.client).to.not.be(undefined)
        expect(err.client.testString).to.be('foo')
        err.client.connection.stream.on('end', function () {
          pool.end(done)
        })
      })
    })

    it('should not change given options', function (done) {
      var options = { max: 10 }
      var pool = new Pool(options)
      pool.connect(function (err, client, release) {
        release()
        if (err) return done(err)
        expect(options).to.eql({ max: 10 })
        pool.end(done)
      })
    })
  })

  describe('with promises', function () {
    it('connects and disconnects', co.wrap(function * () {
      var pool = new Pool()
      var client = yield pool.connect()
      expect(pool.pool.availableObjectsCount()).to.be(0)
      var res = yield client.query('select $1::text as name', ['hi'])
      expect(res.rows).to.eql([{ name: 'hi' }])
      client.release()
      expect(pool.pool.getPoolSize()).to.be(1)
      expect(pool.pool.availableObjectsCount()).to.be(1)
      return yield pool.end()
    }))

    it('properly pools clients', co.wrap(function * () {
      var pool = new Pool({ poolSize: 9 })
      yield _.times(30).map(function * () {
        var client = yield pool.connect()
        yield client.query('select $1::text as name', ['hi'])
        client.release()
      })
      expect(pool.pool.getPoolSize()).to.be(9)
      return yield pool.end()
    }))

    it('supports just running queries', co.wrap(function * () {
      var pool = new Pool({ poolSize: 9 })
      var queries = _.times(30).map(function () {
        return pool.query('SELECT $1::text as name', ['hi'])
      })
      yield queries
      expect(pool.pool.getPoolSize()).to.be(9)
      expect(pool.pool.availableObjectsCount()).to.be(9)
      return yield pool.end()
    }))

    it('recovers from all errors', co.wrap(function * () {
      var pool = new Pool({
        poolSize: 9,
        log: function (str, level) {
          // Custom logging function to ensure we are not causing errors or warnings
          // inside the `generic-pool` library.
          if (level === 'error' || level === 'warn') {
            expect().fail('An error or warning was logged from the generic pool library.\n' +
                          'Level: ' + level + '\n' +
                          'Message: ' + str + '\n')
          }
        }
      })
      var count = 0

      while (count++ < 30) {
        try {
          yield pool.query('SELECT lksjdfd')
        } catch (e) {}
      }
      var res = yield pool.query('SELECT $1::text as name', ['hi'])
      expect(res.rows).to.eql([{ name: 'hi' }])
      return yield pool.end()
    }))
  })
})

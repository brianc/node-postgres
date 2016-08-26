var expect = require('expect.js')
var _ = require('lodash')

var describe = require('mocha').describe
var it = require('mocha').it
var Promise = require('bluebird')

var Pool = require('../')

if (typeof global.Promise === 'undefined') {
  global.Promise = Promise
}

describe('pool', function () {
  it('can be used as a factory function', function () {
    var pool = Pool()
    expect(pool instanceof Pool).to.be.ok()
    expect(typeof pool.connect).to.be('function')
  })

  describe('with callbacks', function () {
    it('works totally unconfigured', function (done) {
      var pool = new Pool()
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
      var pool = new Pool({ binary: true })
      pool.connect(function (err, client, release) {
        release()
        if (err) return done(err)
        expect(client.binary).to.eql(true)
        pool.end(done)
      })
    })

    it('can run a query with a callback without parameters', function (done) {
      var pool = new Pool()
      pool.query('SELECT 1 as num', function (err, res) {
        expect(res.rows[0]).to.eql({ num: 1 })
        pool.end(function () {
          done(err)
        })
      })
    })

    it('can run a query with a callback', function (done) {
      var pool = new Pool()
      pool.query('SELECT $1::text as name', ['brianc'], function (err, res) {
        expect(res.rows[0]).to.eql({ name: 'brianc' })
        pool.end(function () {
          done(err)
        })
      })
    })

    it('passes connection errors to callback', function (done) {
      var pool = new Pool({host: 'no-postgres-server-here.com'})
      pool.query('SELECT $1::text as name', ['brianc'], function (err, res) {
        expect(res).to.be(undefined)
        expect(err).to.be.an(Error)
        pool.end(function (err) {
          done(err)
        })
      })
    })

    it('removes client if it errors in background', function (done) {
      var pool = new Pool()
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
    it('connects and disconnects', function () {
      var pool = new Pool()
      return pool.connect().then(function (client) {
        expect(pool.pool.availableObjectsCount()).to.be(0)
        return client.query('select $1::text as name', ['hi']).then(function (res) {
          expect(res.rows).to.eql([{ name: 'hi' }])
          client.release()
          expect(pool.pool.getPoolSize()).to.be(1)
          expect(pool.pool.availableObjectsCount()).to.be(1)
          return pool.end()
        })
      })
    })

    it('properly pools clients', function () {
      var pool = new Pool({ poolSize: 9 })
      return Promise.map(_.times(30), function () {
        return pool.connect().then(function (client) {
          return client.query('select $1::text as name', ['hi']).then(function (res) {
            client.release()
            return res
          })
        })
      }).then(function (res) {
        expect(res).to.have.length(30)
        expect(pool.pool.getPoolSize()).to.be(9)
        return pool.end()
      })
    })

    it('supports just running queries', function () {
      var pool = new Pool({ poolSize: 9 })
      return Promise.map(_.times(30), function () {
        return pool.query('SELECT $1::text as name', ['hi'])
      }).then(function (queries) {
        expect(queries).to.have.length(30)
        expect(pool.pool.getPoolSize()).to.be(9)
        expect(pool.pool.availableObjectsCount()).to.be(9)
        return pool.end()
      })
    })

    it('recovers from all errors', function () {
      var pool = new Pool()

      var errors = []
      return Promise.mapSeries(_.times(30), function () {
        return pool.query('SELECT asldkfjasldkf')
          .catch(function (e) {
            errors.push(e)
          })
      }).then(function () {
        return pool.query('SELECT $1::text as name', ['hi']).then(function (res) {
          expect(errors).to.have.length(30)
          expect(res.rows).to.eql([{ name: 'hi' }])
          return pool.end()
        })
      })
    })
  })
})

process.on('unhandledRejection', function (e) {
  console.error(e.message, e.stack)
  setImmediate(function () {
    throw e
  })
})

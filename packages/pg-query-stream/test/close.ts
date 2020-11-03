import assert from 'assert'
import concat from 'concat-stream'
import QueryStream from '../src'
import helper from './helper'

if (process.version.startsWith('v8.')) {
  console.error('warning! node less than 10lts stream closing semantics may not behave properly')
} else {
  helper('close', function (client) {
    it('emits close', function (done) {
      const stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [3], {
        batchSize: 2,
        highWaterMark: 2,
      })
      const query = client.query(stream)
      query.pipe(concat(function () {}))
      query.on('close', done)
    })
  })

  helper('early close', function (client) {
    it('can be closed early', function (done) {
      const stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [20000], {
        batchSize: 2,
        highWaterMark: 2,
      })
      const query = client.query(stream)
      let readCount = 0
      query.on('readable', function () {
        readCount++
        query.read()
      })
      query.once('readable', function () {
        query.destroy()
      })
      query.on('close', function () {
        assert(readCount < 10, 'should not have read more than 10 rows')
        done()
      })
    })

    it('can destroy stream while reading', function (done) {
      const stream = new QueryStream('SELECT * FROM generate_series(0, 100), pg_sleep(1)')
      client.query(stream)
      stream.on('data', () => done(new Error('stream should not have returned rows')))
      setTimeout(() => {
        stream.destroy()
        stream.on('close', done)
      }, 100)
    })

    it('emits an error when calling destroy with an error', function (done) {
      const stream = new QueryStream('SELECT * FROM generate_series(0, 100), pg_sleep(1)')
      client.query(stream)
      stream.on('data', () => done(new Error('stream should not have returned rows')))
      setTimeout(() => {
        stream.destroy(new Error('intentional error'))
        stream.on('error', (err) => {
          // make sure there's an error
          assert(err)
          assert.strictEqual(err.message, 'intentional error')
          done()
        })
      }, 100)
    })

    it('can destroy stream while reading an error', function (done) {
      const stream = new QueryStream('SELECT * from  pg_sleep(1), basdfasdf;')
      client.query(stream)
      stream.on('data', () => done(new Error('stream should not have returned rows')))
      stream.once('error', () => {
        stream.destroy()
        // wait a bit to let any other errors shake through
        setTimeout(done, 100)
      })
    })

    it('does not crash when destroying the stream immediately after calling read', function (done) {
      const stream = new QueryStream('SELECT * from generate_series(0, 100), pg_sleep(1);')
      client.query(stream)
      stream.on('data', () => done(new Error('stream should not have returned rows')))
      stream.destroy()
      stream.on('close', done)
    })

    it('does not crash when destroying the stream before its submitted', function (done) {
      const stream = new QueryStream('SELECT * from generate_series(0, 100), pg_sleep(1);')
      stream.on('data', () => done(new Error('stream should not have returned rows')))
      stream.destroy()
      stream.on('close', done)
    })
  })
}

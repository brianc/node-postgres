'use strict'
const co = require('co')
const expect = require('expect.js')

const describe = require('mocha').describe
const it = require('mocha').it

const Pool = require('../')

describe('pool ending', () => {
  it('ends without being used', (done) => {
    const pool = new Pool()
    pool.end(done)
  })

  it('ends with a promise', () => {
    return new Pool().end()
  })

  it(
    'ends with clients',
    co.wrap(function* () {
      const pool = new Pool()
      const res = yield pool.query('SELECT $1::text as name', ['brianc'])
      expect(res.rows[0].name).to.equal('brianc')
      return pool.end()
    })
  )

  it(
    'allows client to finish',
    co.wrap(function* () {
      const pool = new Pool()
      const query = pool.query('SELECT $1::text as name', ['brianc'])
      yield pool.end()
      const res = yield query
      expect(res.rows[0].name).to.equal('brianc')
    })
  )

  it('pool.end() - finish pending queries by default', async () => {
    const pool = new Pool({ poolSize: 10 }) // pool size 10
    let completed = 0
    for (let x = 1; x <= 20; x++) { // queue up 20 queries
       pool.query('SELECT $1::text as name', ['brianc']).then(() => completed++)
    }
    await pool.end() // pool.end()
    expect(completed).to.equal(19) // all 20 queries finish (only 19 here because bug #2163 the last query callback hasn't run yet)
  })

  it('pool.end(true) - drop pending queries', async () => {
    const pool = new Pool({ poolSize: 10 }) // pool size 10
    let completed = 0
    for (let x = 1; x <= 20; x++) { // queue up 20 queries
       pool.query('SELECT $1::text as name', ['brianc']).then(() => completed++)
    }
    await pool.end(true) // pool.end(true)
    expect(completed).to.equal(9) // 10 active queries finish, 10 pending queries get dropped (only 9 here because bug #2163 the last query callback hasn't run yet)
  })
})

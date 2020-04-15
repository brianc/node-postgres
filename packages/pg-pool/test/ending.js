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

  it('finish pending queries', async () => {
    const pool = new Pool({ poolSize: 10 })
    const queries = {}
    for (let x = 1; x <= 20; x++) {
       queries[x] = pool.query('SELECT $1::text as name', ['brianc' + x])
    }
    pool.end(false)
    expect((await queries[20]).rows[0].name).to.equal('brianc20')
  })

  it('drop pending queries', async () => {
    const pool = new Pool({ poolSize: 10 })
    let completed = 0
    for (let x = 1; x <= 20; x++) {
       pool.query('SELECT $1::text as name', ['brianc' + x]).then(() => completed++)
    }
    await pool.end(true)
    expect(completed).to.equal(9)
  })
})

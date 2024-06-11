'use strict'
const co = require('co')
const expect = require('expect.js')

const describe = require('mocha').describe
const it = require('mocha').it

const Pool = require('../')

describe('lifetime timeout', () => {
  it('connection lifetime should expire and remove the client', (done) => {
    const pool = new Pool({ maxLifetimeSeconds: 1 })
    pool.query('SELECT NOW()')
    pool.on('remove', () => {
      console.log('expired while idle - on-remove event')
      expect(pool.expiredCount).to.equal(0)
      expect(pool.totalCount).to.equal(0)
      done()
    })
  })
  it('connection lifetime should expire and remove the client after the client is done working', (done) => {
    const pool = new Pool({ maxLifetimeSeconds: 1 })
    pool.query('SELECT pg_sleep(1.4)')
    pool.on('remove', () => {
      console.log('expired while busy - on-remove event')
      expect(pool.expiredCount).to.equal(0)
      expect(pool.totalCount).to.equal(0)
      done()
    })
  })
  it(
    'can remove expired clients and recreate them',
    co.wrap(function* () {
      const pool = new Pool({ maxLifetimeSeconds: 1 })
      let query = pool.query('SELECT pg_sleep(1.4)')
      expect(pool.expiredCount).to.equal(0)
      expect(pool.totalCount).to.equal(1)
      yield query
      yield new Promise((resolve) => setTimeout(resolve, 100))
      expect(pool.expiredCount).to.equal(0)
      expect(pool.totalCount).to.equal(0)
      yield pool.query('SELECT NOW()')
      expect(pool.expiredCount).to.equal(0)
      expect(pool.totalCount).to.equal(1)
    })
  )
})

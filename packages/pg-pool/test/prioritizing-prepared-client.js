const expect = require('expect.js')
const co = require('co')

const describe = require('mocha').describe
const it = require('mocha').it

const Pool = require('../')

describe('prioritizing prepared client', () => {
  it(
    'can create a single client with prepared statment and reuse it',
    co.wrap(function* () {
      const pool = new Pool({ max: 2 })
      expect(pool.waitingCount).to.equal(0)

      let res

      res = yield pool.query({ text: 'SELECT $1::text as name', values: ['hi'], name: 'foo' })
      expect(res.rows[0].name).to.equal('hi')
      expect(pool._idle.length).to.equal(1)

      res = yield pool.query({ text: 'SELECT $1::text as name', values: ['ho'], name: 'foo' })
      expect(res.rows[0].name).to.equal('ho')
      expect(pool._idle.length).to.equal(1)

      pool.end()
    })
  )
})

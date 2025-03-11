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
      expect(pool._idle.length).to.equal(0)

      // force the creation of two client and release.
      // In this way we have two idle client
      const firstClient = yield pool.connect()
      expect(pool._clients.length).to.equal(1)
      const secondClient = yield pool.connect()
      expect(pool._clients.length).to.equal(2)
      firstClient.release()
      secondClient.release()
      expect(pool._idle.length).to.equal(2)

      let res, firstPid, secondPid

      // check the same client with prepared query

      res = yield pool.query({ text: 'SELECT $1::text as name, pg_backend_pid() as pid', values: ['hi'], name: 'foo' })
      expect(res.rows[0].name).to.equal('hi')
      expect(pool._idle.length).to.equal(2)
      firstPid = res.rows[0].pid

      res = yield pool.query({ text: 'SELECT $1::text as name, pg_backend_pid() as pid', values: ['ho'], name: 'foo' })
      expect(res.rows[0].name).to.equal('ho')
      expect(pool._idle.length).to.equal(2)
      secondPid = res.rows[0].pid

      expect(firstPid).to.equal(secondPid)

      // not the same client without prepared query

      res = yield pool.query({ text: 'SELECT $1::text as name, pg_backend_pid() as pid', values: ['hi'] })
      expect(res.rows[0].name).to.equal('hi')
      expect(pool._idle.length).to.equal(2)
      firstPid = res.rows[0].pid

      res = yield pool.query({ text: 'SELECT $1::text as name, pg_backend_pid() as pid', values: ['ho'] })
      expect(res.rows[0].name).to.equal('ho')
      expect(pool._idle.length).to.equal(2)
      secondPid = res.rows[0].pid

      expect(firstPid).to.not.equal(secondPid)

      pool.end()
    })
  )
})

import helper from './helper'
import QueryStream from '../src'
import spec from 'stream-spec'
import assert from 'assert'

helper('stream tester timestamp', function (client) {
  it('should not warn about max listeners', function (done) {
    const sql = "SELECT * FROM generate_series('1983-12-30 00:00'::timestamp, '2013-12-30 00:00', '1 years')"
    const stream = new QueryStream(sql, [])
    let ended = false
    const query = client.query(stream)
    query.on('end', function () {
      ended = true
    })
    spec(query).readable().pausable({ strict: true }).validateOnExit()
    const checkListeners = function () {
      assert(stream.listeners('end').length < 10)
      if (!ended) {
        setImmediate(checkListeners)
      } else {
        done()
      }
    }
    checkListeners()
  })
})

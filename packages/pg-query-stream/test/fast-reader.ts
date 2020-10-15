import assert from 'assert'
import helper from './helper'
import QueryStream from '../src'

helper('fast reader', function (client) {
  it('works', function (done) {
    const stream = new QueryStream('SELECT * FROM generate_series(0, 200) num', [])
    const query = client.query(stream)
    const result = []
    stream.on('readable', function () {
      let res = stream.read()
      while (res) {
        if (result.length !== 201) {
          assert(res, 'should not return null on evented reader')
        } else {
          // a readable stream will emit a null datum when it finishes being readable
          // https://nodejs.org/api/stream.html#stream_event_readable
          assert.equal(res, null)
        }
        if (res) {
          result.push(res.num)
        }
        res = stream.read()
      }
    })
    stream.on('end', function () {
      const total = result.reduce(function (prev, cur) {
        return prev + cur
      })
      assert.equal(total, 20100)
      done()
    })
    assert.strictEqual(query.read(2), null)
  })
})

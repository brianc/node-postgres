var pg = require('pg')
var assert = require('assert')
var QueryStream = require('../')

describe('client options', function () {
  it('uses custom types from client config', function (done) {
    const types = {
      getTypeParser: () => (string) => string,
    }
    var client = new pg.Client({ types })
    client.connect()
    var stream = new QueryStream('SELECT * FROM generate_series(0, 10) num')
    var query = client.query(stream)
    var result = []
    query.on('data', (datum) => {
      result.push(datum)
    })
    query.on('end', () => {
      const expected = new Array(11).fill(0).map((_, i) => ({
        num: i.toString(),
      }))
      assert.deepEqual(result, expected)
      client.end()
      done()
    })
  })
})

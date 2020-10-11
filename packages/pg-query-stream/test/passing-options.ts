var assert = require('assert')
var helper = require('./helper')
var QueryStream = require('../')

helper('passing options', function (client) {
  it('passes row mode array', function (done) {
    var stream = new QueryStream('SELECT * FROM generate_series(0, 10) num', [], { rowMode: 'array' })
    var query = client.query(stream)
    var result = []
    query.on('data', (datum) => {
      result.push(datum)
    })
    query.on('end', () => {
      const expected = new Array(11).fill(0).map((_, i) => [i])
      assert.deepEqual(result, expected)
      done()
    })
  })

  it('passes custom types', function (done) {
    const types = {
      getTypeParser: () => (string) => string,
    }
    var stream = new QueryStream('SELECT * FROM generate_series(0, 10) num', [], { types })
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
      done()
    })
  })
})

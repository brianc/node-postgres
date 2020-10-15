import assert from 'assert'
import helper from './helper'
import QueryStream from '../src'

helper('passing options', function (client) {
  it('passes row mode array', function (done) {
    const stream = new QueryStream('SELECT * FROM generate_series(0, 10) num', [], { rowMode: 'array' })
    const query = client.query(stream)
    const result = []
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
    const stream = new QueryStream('SELECT * FROM generate_series(0, 10) num', [], { types })
    const query = client.query(stream)
    const result = []
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

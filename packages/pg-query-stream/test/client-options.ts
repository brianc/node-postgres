import pg from 'pg'
import assert from 'assert'
import QueryStream from '../src'

describe('client options', function () {
  it('uses custom types from client config', function (done) {
    const types = {
      getTypeParser: () => (string) => string,
    }
    //@ts-expect-error
    const client = new pg.Client({ types })
    client.connect()
    const stream = new QueryStream('SELECT * FROM generate_series(0, 10) num')
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
      client.end()
      done()
    })
  })
})

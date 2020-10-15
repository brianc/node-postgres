import spec from 'stream-spec'
import helper from './helper'
import QueryStream from '../src'

helper('stream tester', function (client) {
  it('passes stream spec', function (done) {
    const stream = new QueryStream('SELECT * FROM generate_series(0, 200) num', [])
    const query = client.query(stream)
    spec(query).readable().pausable({ strict: true }).validateOnExit()
    stream.on('end', done)
  })
})

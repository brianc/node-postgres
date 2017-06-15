const helper = require('./test-helper')
const pg = helper.pg
const suite = new helper.Suite()

suite.test('Query with a callback should still support event-listeners', (done) => {
  const client = new pg.Client()
  const sink = new helper.Sink(3, 1000, () => {
    client.end()
    done()
  })
  client.connect()
  const query = client.query('SELECT NOW()', (err, res) => {
    sink.add()
  })
  query.on('row', () => sink.add())
  query.on('end', () => sink.add())
})

suite.test('Query with a promise should still support event-listeners', (done) => {
  const client = new pg.Client()
  const sink = new helper.Sink(3, 1000, () => {
    client.end()
    done()
  })
  client.connect()
  const query = client.query('SELECT NOW()')
  query.on('row', () => sink.add())
  query.on('end', () => sink.add())
  query.then(() => sink.add())
})

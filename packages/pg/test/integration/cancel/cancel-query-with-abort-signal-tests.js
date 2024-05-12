var helper = require('./../test-helper')

var pg = helper.pg
const Client = pg.Client
const DatabaseError = pg.DatabaseError

if (!global.AbortController) {
  // Skip these tests if AbortController is not available
  return
}

const suite = new helper.Suite('query cancellation with abort signal')

suite.test('query with signal succeeds if not aborted', function (done) {
  const client = new Client()
  const { signal } = new AbortController()

  client.connect(
    assert.success(() => {
      client.query(
        new pg.Query({ text: 'select pg_sleep(0.1)', signal }),
        assert.success((result) => {
          assert.equal(result.rows[0].pg_sleep, '')
          client.end(done)
        })
      )
    })
  )
})

if (helper.config.native) {
  // Skip these tests if native bindings are enabled
  return
}

suite.test('query with signal is not submitted if the signal is already aborted', function (done) {
  const client = new Client()
  const signal = AbortSignal.abort()

  let counter = 0

  client.query(
    new pg.Query({ text: 'INVALID SQL...' }),
    assert.calls((err) => {
      assert(err instanceof DatabaseError)
      counter++
    })
  )

  client.query(
    new pg.Query({ text: 'begin' }),
    assert.success(() => {
      counter++
    })
  )

  client.query(
    new pg.Query({ text: 'INVALID SQL...', signal }),
    assert.calls((err) => {
      assert.equal(err.name, 'AbortError')
      counter++
    })
  )

  client.query(
    new pg.Query({ text: 'select 1' }),
    assert.success(() => {
      counter++
      assert.equal(counter, 4)
      client.end(done)
    })
  )

  client.connect(assert.success(() => {}))
})

suite.test('query can be canceled with abort signal', function (done) {
  const client = new Client()
  const ac = new AbortController()
  const { signal } = ac

  client.query(
    new pg.Query({ text: 'SELECT pg_sleep(0.5)', signal }),
    assert.calls((err) => {
      assert(err instanceof DatabaseError)
      assert.equal(err.code, '57014')
      client.end(done)
    })
  )

  client.connect(
    assert.success(() => {
      setTimeout(() => {
        ac.abort()
      }, 50)
    })
  )
})

suite.test('long abort signal timeout does not keep the query / connection going', function (done) {
  const client = new Client()
  const ac = new AbortController()
  setTimeout(() => ac.abort(), 10000).unref()

  client.query(
    new pg.Query({ text: 'SELECT pg_sleep(0.1)', signal: ac.signal }),
    assert.success((result) => {
      assert.equal(result.rows[0].pg_sleep, '')
      client.end(done)
    })
  )

  client.connect(assert.success(() => {}))
})

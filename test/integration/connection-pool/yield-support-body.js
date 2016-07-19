var helper = require('./test-helper')
var co = require('co')

var tid = setTimeout(function() {
  throw new Error('Tests did not complete in time')
}, 1000)

co(function * () {
  var client = yield helper.pg.connect()
  var res = yield client.query('SELECT $1::text as name', ['foo'])
  assert.equal(res.rows[0].name, 'foo')

  var threw = false
  try {
    yield client.query('SELECT LKDSJDSLKFJ')
  } catch(e) {
    threw = true
  }
  assert(threw)
  client.release()
  helper.pg.end()
  clearTimeout(tid)
})
.catch(function(e) {
  setImmediate(function() {
    throw e
  })
})

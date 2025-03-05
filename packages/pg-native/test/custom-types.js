const Client = require('../')
const ok = require('okay')
const assert = require('assert')

describe('Custom type parser', function () {
  it('is used by client', function (done) {
    const client = new Client({
      types: {
        getTypeParser: function () {
          return function () {
            return 'blah'
          }
        },
      },
    })
    client.connectSync()
    const rows = client.querySync('SELECT NOW() AS when')
    assert.equal(rows[0].when, 'blah')
    client.query(
      'SELECT NOW() as when',
      ok(function (rows) {
        assert.equal(rows[0].when, 'blah')
        client.end(done)
      })
    )
  })
})

'use strict'
var helper = require(__dirname + '/test-helper')
// http://developer.postgresql.org/pgdocs/postgres/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY

test('flushing once', function () {
  helper.connect(function (con) {
    con.parse({
      text: 'select * from ids'
    })

    con.bind()
    con.execute()
    con.flush()

    assert.emits(con, 'parseComplete')
    assert.emits(con, 'bindComplete')
    assert.emits(con, 'dataRow')
    assert.emits(con, 'commandComplete', function () {
      con.sync()
    })
    assert.emits(con, 'readyForQuery', function () {
      con.end()
    })
  })
})

test('sending many flushes', function () {
  helper.connect(function (con) {
    assert.emits(con, 'parseComplete', function () {
      con.bind()
      con.flush()
    })

    assert.emits(con, 'bindComplete', function () {
      con.execute()
      con.flush()
    })

    assert.emits(con, 'dataRow', function (msg) {
      assert.equal(msg.fields[0], 1)
      assert.emits(con, 'dataRow', function (msg) {
        assert.equal(msg.fields[0], 2)
        assert.emits(con, 'commandComplete', function () {
          con.sync()
        })
        assert.emits(con, 'readyForQuery', function () {
          con.end()
        })
      })
    })

    con.parse({
      text: 'select * from ids order by id'
    })

    con.flush()
  })
})

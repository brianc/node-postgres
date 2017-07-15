'use strict'
var helper = require(__dirname + '/test-helper')
var pg = helper.pg

var suite = new helper.Suite()

const pool = new pg.Pool()

pool.connect(assert.calls(function (err, client, release) {
  assert(!err)

  suite.test('nulls', function (done) {
    client.query('SELECT $1::text[] as array', [[null]], assert.success(function (result) {
      var array = result.rows[0].array
      assert.lengthIs(array, 1)
      assert.isNull(array[0])
      done()
    }))
  })

  suite.test('elements containing JSON-escaped characters', function (done) {
    var param = '\\"\\"'

    for (var i = 1; i <= 0x1f; i++) {
      param += String.fromCharCode(i)
    }

    client.query('SELECT $1::text[] as array', [[param]], assert.success(function (result) {
      var array = result.rows[0].array
      assert.lengthIs(array, 1)
      assert.equal(array[0], param)
      done()
    }))
  })

  suite.test('cleanup', () => release())

  pool.connect(assert.calls(function (err, client, release) {
    assert(!err)
    client.query('CREATE TEMP TABLE why(names text[], numbors integer[])')
    client.query(new pg.Query('INSERT INTO why(names, numbors) VALUES(\'{"aaron", "brian","a b c" }\', \'{1, 2, 3}\')')).on('error', console.log)
    suite.test('numbers', function (done) {
      //      client.connection.on('message', console.log)
      client.query('SELECT numbors FROM why', assert.success(function (result) {
        assert.lengthIs(result.rows[0].numbors, 3)
        assert.equal(result.rows[0].numbors[0], 1)
        assert.equal(result.rows[0].numbors[1], 2)
        assert.equal(result.rows[0].numbors[2], 3)
        done()
      }))
    })

    suite.test('parses string arrays', function (done) {
      client.query('SELECT names FROM why', assert.success(function (result) {
        var names = result.rows[0].names
        assert.lengthIs(names, 3)
        assert.equal(names[0], 'aaron')
        assert.equal(names[1], 'brian')
        assert.equal(names[2], 'a b c')
        done()
      }))
    })

    suite.test('empty array', function (done) {
      client.query("SELECT '{}'::text[] as names", assert.success(function (result) {
        var names = result.rows[0].names
        assert.lengthIs(names, 0)
        done()
      }))
    })

    suite.test('element containing comma', function (done) {
      client.query("SELECT '{\"joe,bob\",jim}'::text[] as names", assert.success(function (result) {
        var names = result.rows[0].names
        assert.lengthIs(names, 2)
        assert.equal(names[0], 'joe,bob')
        assert.equal(names[1], 'jim')
        done()
      }))
    })

    suite.test('bracket in quotes', function (done) {
      client.query("SELECT '{\"{\",\"}\"}'::text[] as names", assert.success(function (result) {
        var names = result.rows[0].names
        assert.lengthIs(names, 2)
        assert.equal(names[0], '{')
        assert.equal(names[1], '}')
        done()
      }))
    })

    suite.test('null value', function (done) {
      client.query("SELECT '{joe,null,bob,\"NULL\"}'::text[] as names", assert.success(function (result) {
        var names = result.rows[0].names
        assert.lengthIs(names, 4)
        assert.equal(names[0], 'joe')
        assert.equal(names[1], null)
        assert.equal(names[2], 'bob')
        assert.equal(names[3], 'NULL')
        done()
      }))
    })

    suite.test('element containing quote char', function (done) {
      client.query("SELECT ARRAY['joe''', 'jim', 'bob\"'] AS names", assert.success(function (result) {
        var names = result.rows[0].names
        assert.lengthIs(names, 3)
        assert.equal(names[0], 'joe\'')
        assert.equal(names[1], 'jim')
        assert.equal(names[2], 'bob"')
        done()
      }))
    })

    suite.test('nested array', function (done) {
      client.query("SELECT '{{1,joe},{2,bob}}'::text[] as names", assert.success(function (result) {
        var names = result.rows[0].names
        assert.lengthIs(names, 2)

        assert.lengthIs(names[0], 2)
        assert.equal(names[0][0], '1')
        assert.equal(names[0][1], 'joe')

        assert.lengthIs(names[1], 2)
        assert.equal(names[1][0], '2')
        assert.equal(names[1][1], 'bob')
        done()
      }))
    })

    suite.test('integer array', function (done) {
      client.query("SELECT '{1,2,3}'::integer[] as names", assert.success(function (result) {
        var names = result.rows[0].names
        assert.lengthIs(names, 3)
        assert.equal(names[0], 1)
        assert.equal(names[1], 2)
        assert.equal(names[2], 3)
        done()
      }))
    })

    suite.test('integer nested array', function (done) {
      client.query("SELECT '{{1,100},{2,100},{3,100}}'::integer[] as names", assert.success(function (result) {
        var names = result.rows[0].names
        assert.lengthIs(names, 3)
        assert.equal(names[0][0], 1)
        assert.equal(names[0][1], 100)

        assert.equal(names[1][0], 2)
        assert.equal(names[1][1], 100)

        assert.equal(names[2][0], 3)
        assert.equal(names[2][1], 100)
        done()
      }))
    })

    suite.test('JS array parameter', function (done) {
      client.query('SELECT $1::integer[] as names', [[[1, 100], [2, 100], [3, 100]]], assert.success(function (result) {
        var names = result.rows[0].names
        assert.lengthIs(names, 3)
        assert.equal(names[0][0], 1)
        assert.equal(names[0][1], 100)

        assert.equal(names[1][0], 2)
        assert.equal(names[1][1], 100)

        assert.equal(names[2][0], 3)
        assert.equal(names[2][1], 100)
        release()
        pool.end(() => {
          done()
        })
      }))
    })
  }))
}))

'use strict'
var helper = require('../test-helper')
var Client = require('../../lib/native')
var Query = Client.Query

var setupClient = function () {
  var client = new Client(helper.config)
  client.connect()
  client.query('CREATE TEMP TABLE boom(name varchar(10), age integer)')
  client.query("INSERT INTO boom(name, age) VALUES('Aaron', 26)")
  client.query("INSERT INTO boom(name, age) VALUES('Brian', 28)")
  return client
}

test('multiple results', function () {
  test('queued queries', function () {
    var client = setupClient()
    var q = client.query(new Query('SELECT name FROM BOOM'))
    assert.emits(q, 'row', function (row) {
      assert.equal(row.name, 'Aaron')
      assert.emits(q, 'row', function (row) {
        assert.equal(row.name, 'Brian')
      })
    })
    assert.emits(q, 'end', function () {
      test('query with config', function () {
        var q2 = client.query(new Query({text: 'SELECT 1 as num'}))
        assert.emits(q2, 'row', function (row) {
          assert.strictEqual(row.num, 1)
          assert.emits(q2, 'end', function () {
            client.end()
          })
        })
      })
    })
  })
})

test('parameterized queries', function () {
  test('with a single string param', function () {
    var client = setupClient()
    var q = client.query(new Query('SELECT * FROM boom WHERE name = $1', ['Aaron']))
    assert.emits(q, 'row', function (row) {
      assert.equal(row.name, 'Aaron')
    })
    assert.emits(q, 'end', function () {
      client.end()
    })
  })

  test('with object config for query', function () {
    var client = setupClient()
    var q = client.query(new Query({
      text: 'SELECT name FROM boom WHERE name = $1',
      values: ['Brian']
    }))
    assert.emits(q, 'row', function (row) {
      assert.equal(row.name, 'Brian')
    })
    assert.emits(q, 'end', function () {
      client.end()
    })
  })

  test('multiple parameters', function () {
    var client = setupClient()
    var q = client.query(new Query('SELECT name FROM boom WHERE name = $1 or name = $2 ORDER BY name COLLATE "C"', ['Aaron', 'Brian']))
    assert.emits(q, 'row', function (row) {
      assert.equal(row.name, 'Aaron')
      assert.emits(q, 'row', function (row) {
        assert.equal(row.name, 'Brian')
        assert.emits(q, 'end', function () {
          client.end()
        })
      })
    })
  })

  test('integer parameters', function () {
    var client = setupClient()
    var q = client.query(new Query('SELECT * FROM boom WHERE age > $1', [27]))
    assert.emits(q, 'row', function (row) {
      assert.equal(row.name, 'Brian')
      assert.equal(row.age, 28)
    })
    assert.emits(q, 'end', function () {
      client.end()
    })
  })
})

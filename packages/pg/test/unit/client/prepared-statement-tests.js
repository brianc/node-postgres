'use strict'
const helper = require('./test-helper')
const Query = require('../../../lib/query')
const assert = require('assert')
const client = helper.client()
const suite = new helper.Suite()
const test = suite.test.bind(suite)

const con = client.connection
let parseArg = null
con.parse = function (arg) {
  parseArg = arg
  process.nextTick(function () {
    con.emit('parseComplete')
  })
}

let bindArg = null
con.bind = function (arg) {
  bindArg = arg
  process.nextTick(function () {
    con.emit('bindComplete')
  })
}

let executeArg = null
con.execute = function (arg) {
  executeArg = arg
  process.nextTick(function () {
    con.emit('rowData', { fields: [] })
    con.emit('commandComplete', { text: '' })
  })
}

let describeArg = null
con.describe = function (arg) {
  describeArg = arg
  process.nextTick(function () {
    con.emit('rowDescription', { fields: [] })
  })
}

let syncCalled = false
con.flush = function () {}
con.sync = function () {
  syncCalled = true
  process.nextTick(function () {
    con.emit('readyForQuery')
  })
}

test('bound command', function () {
  test('simple, unnamed bound command', function () {
    assert.ok(client.connection.emit('readyForQuery'))

    const query = client.query(
      new Query({
        text: 'select * from X where name = $1',
        values: ['hi'],
      })
    )

    assert.emits(query, 'end', function () {
      test('parse argument', function () {
        assert.equal(parseArg.name, null)
        assert.equal(parseArg.text, 'select * from X where name = $1')
        assert.equal(parseArg.types, null)
      })

      test('bind argument', function () {
        assert.equal(bindArg.statement, null)
        assert.equal(bindArg.portal, '')
        assert.lengthIs(bindArg.values, 1)
        assert.equal(bindArg.values[0], 'hi')
      })

      test('describe argument', function () {
        assert.equal(describeArg.type, 'P')
        assert.equal(describeArg.name, '')
      })

      test('execute argument', function () {
        assert.equal(executeArg.portal, '')
        assert.equal(executeArg.rows, null)
      })

      test('sync called', function () {
        assert.ok(syncCalled)
      })
    })
  })
})

const portalClient = helper.client()
const portalCon = portalClient.connection
portalCon.parse = function (arg) {
  process.nextTick(function () {
    portalCon.emit('parseComplete')
  })
}

let portalBindArg = null
portalCon.bind = function (arg) {
  portalBindArg = arg
  process.nextTick(function () {
    portalCon.emit('bindComplete')
  })
}

let portalExecuteArg = null
portalCon.execute = function (arg) {
  portalExecuteArg = arg
  process.nextTick(function () {
    portalCon.emit('rowData', { fields: [] })
    portalCon.emit('commandComplete', { text: '' })
  })
}

let portalDescribeArg = null
portalCon.describe = function (arg) {
  portalDescribeArg = arg
  process.nextTick(function () {
    portalCon.emit('rowDescription', { fields: [] })
  })
}

portalCon.flush = function () {}
portalCon.sync = function () {
  process.nextTick(function () {
    portalCon.emit('readyForQuery')
  })
}

test('prepared statement with explicit portal', function () {
  assert.ok(portalClient.connection.emit('readyForQuery'))

  const query = portalClient.query(
    new Query({
      text: 'select * from X where name = $1',
      portal: 'myportal',
      values: ['hi'],
    })
  )

  assert.emits(query, 'end', function () {
    test('bind argument', function () {
      assert.equal(portalBindArg.portal, 'myportal')
    })

    test('describe argument', function () {
      assert.equal(portalDescribeArg.name, 'myportal')
    })

    test('execute argument', function () {
      assert.equal(portalExecuteArg.portal, 'myportal')
    })
  })
})

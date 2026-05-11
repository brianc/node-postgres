'use strict'
const helper = require('./test-helper')
const Query = helper.pg.Query

const assert = require('assert')
const suite = new helper.Suite()

;(function () {
  const queryName = 'user by age and like name'

  suite.test('first named prepared statement', async function () {
    const client = helper.client()
    await helper.createPersonTable(client)
    return new Promise((resolve) => {
      const query = client.query(
        new Query({
          text: 'select name from person where age <= $1 and name LIKE $2',
          values: [20, 'Bri%'],
          name: queryName,
        })
      )

      assert.emits(query, 'row', function (row) {
        assert.equal(row.name, 'Brian')
      })

      query.on('end', () => {
        client.end(resolve)
      })
    })
  })

  suite.test('second named prepared statement with same name & text', async function () {
    const client = helper.client()
    await helper.createPersonTable(client)
    return new Promise((resolve) => {
      const cachedQuery = client.query(
        new Query({
          text: 'select name from person where age <= $1 and name LIKE $2',
          name: queryName,
          values: [10, 'A%'],
        })
      )

      assert.emits(cachedQuery, 'row', function (row) {
        assert.equal(row.name, 'Aaron')
      })

      cachedQuery.on('end', () => {
        client.end(resolve)
      })
    })
  })

  suite.test('with same name, but without query text', async function () {
    const client = helper.client()
    await helper.createPersonTable(client)
    // First, register the named statement
    await new Promise((resolve) => {
      const reg = client.query(
        new Query({
          text: 'select name from person where age <= $1 and name LIKE $2',
          name: queryName,
          values: [20, 'Bri%'],
        })
      )
      reg.on('end', resolve)
    })
    return new Promise((resolve) => {
      const q = client.query(
        new Query({
          name: queryName,
          values: [30, '%n%'],
        })
      )

      assert.emits(q, 'row', function (row) {
        assert.equal(row.name, 'Aaron')

        // test second row is emitted as well
        assert.emits(q, 'row', function (row) {
          assert.equal(row.name, 'Brian')
        })
      })

      q.on('end', () => {
        client.end(resolve)
      })
    })
  })

  suite.test('with same name, but with different text', async function () {
    const client = helper.client()
    await helper.createPersonTable(client)
    // First, register the named statement
    await new Promise((resolve) => {
      const reg = client.query(
        new Query({
          text: 'select name from person where age <= $1 and name LIKE $2',
          name: queryName,
          values: [20, 'Bri%'],
        })
      )
      reg.on('end', resolve)
    })
    return new Promise((resolve) => {
      client.query(
        new Query({
          text: 'select name from person where age >= $1 and name LIKE $2',
          name: queryName,
          values: [30, '%n%'],
        }),
        assert.calls((err) => {
          assert.equal(
            err.message,
            `Prepared statements must be unique - '${queryName}' was used for a different statement`
          )
          client.end(resolve)
        })
      )
    })
  })
})()
;(function () {
  const statementName = 'differ'
  const statement1 = 'select count(*)::int4 as count from person'
  const statement2 = 'select count(*)::int4 as count from person where age < $1'

  suite.test('client 1 execution', async function () {
    const client1 = helper.client()
    await helper.createPersonTable(client1)
    return new Promise((resolve) => {
      client1.query(
        {
          name: statementName,
          text: statement1,
        },
        (err, res) => {
          assert(!err)
          assert.equal(res.rows[0].count, 26)
          client1.end(resolve)
        }
      )
    })
  })

  suite.test('client 2 execution', async function () {
    const client2 = helper.client()
    await helper.createPersonTable(client2)
    return new Promise((resolve) => {
      const query = client2.query(
        new Query({
          name: statementName,
          text: statement2,
          values: [11],
        })
      )

      assert.emits(query, 'row', function (row) {
        assert.equal(row.count, 1)
      })

      assert.emits(query, 'end', function () {
        client2.end(resolve)
      })
    })
  })
})()
;(function () {
  const client = helper.client()
  client.query('CREATE TEMP TABLE zoom(name varchar(100));')
  client.query("INSERT INTO zoom (name) VALUES ('zed')")
  client.query("INSERT INTO zoom (name) VALUES ('postgres')")
  client.query("INSERT INTO zoom (name) VALUES ('node postgres')")

  const checkForResults = function (q) {
    assert.emits(q, 'row', function (row) {
      assert.equal(row.name, 'node postgres')

      assert.emits(q, 'row', function (row) {
        assert.equal(row.name, 'postgres')

        assert.emits(q, 'row', function (row) {
          assert.equal(row.name, 'zed')
        })
      })
    })
  }

  suite.test('with small row count', function (done) {
    const query = client.query(
      new Query(
        {
          name: 'get names',
          text: 'SELECT name FROM zoom ORDER BY name COLLATE "C"',
          rows: 1,
        },
        done
      )
    )

    checkForResults(query)
  })

  suite.test('with large row count', function (done) {
    const query = client.query(
      new Query(
        {
          name: 'get names',
          text: 'SELECT name FROM zoom ORDER BY name COLLATE "C"',
          rows: 1000,
        },
        done
      )
    )
    checkForResults(query)
  })

  suite.test('with no data response and rows', async function () {
    const result = await client.query({
      name: 'some insert',
      text: '',
      values: [],
      rows: 1,
    })
    assert.equal(result.rows.length, 0)
  })

  suite.test('cleanup', () => client.end())
})()

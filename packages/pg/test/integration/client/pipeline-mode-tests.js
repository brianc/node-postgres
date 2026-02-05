'use strict'

const helper = require('../test-helper')
const pg = helper.pg
const assert = require('assert')
const Client = pg.Client

const suite = new helper.Suite('pipeline mode integration')

// Skip tests if native mode (pipeline mode is only for JS client)
if (helper.args.native) {
  console.log('Skipping pipeline mode tests in native mode')
  return
}

suite.test('pipeline mode - basic multiple queries', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    const results = []
    const promises = [
      client.query('SELECT 1 as num').then((r) => results.push({ order: 0, value: r.rows[0].num })),
      client.query('SELECT 2 as num').then((r) => results.push({ order: 1, value: r.rows[0].num })),
      client.query('SELECT 3 as num').then((r) => results.push({ order: 2, value: r.rows[0].num })),
    ]

    Promise.all(promises).then(() => {
      // Verify all results received
      assert.equal(results.length, 3, 'Should have 3 results')
      // Verify correct values (order may vary due to async push)
      const values = results.map((r) => r.value).sort()
      assert.deepEqual(values, ['1', '2', '3'])
      client.end(done)
    })
  })
})

suite.test('pipeline mode - query ordering preservation', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Use pg_sleep to ensure queries take different times
    // but results should still come back in order
    const startTimes = []
    const endTimes = []

    const p1 = client.query('SELECT 1 as num, pg_sleep(0.05)').then((r) => {
      endTimes.push({ query: 1, time: Date.now() })
      return r.rows[0].num
    })
    startTimes.push({ query: 1, time: Date.now() })

    const p2 = client.query('SELECT 2 as num').then((r) => {
      endTimes.push({ query: 2, time: Date.now() })
      return r.rows[0].num
    })
    startTimes.push({ query: 2, time: Date.now() })

    const p3 = client.query('SELECT 3 as num, pg_sleep(0.02)').then((r) => {
      endTimes.push({ query: 3, time: Date.now() })
      return r.rows[0].num
    })
    startTimes.push({ query: 3, time: Date.now() })

    Promise.all([p1, p2, p3]).then((values) => {
      // Results should be in submission order
      assert.deepEqual(values, ['1', '2', '3'], 'Results should be in submission order')
      client.end(done)
    })
  })
})

suite.test('pipeline mode - error isolation', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // First query succeeds
    const p1 = client.query('SELECT 1 as num')

    // Second query fails (invalid table)
    const p2 = client.query('SELECT * FROM nonexistent_table_xyz')

    // Third query should still succeed
    const p3 = client.query('SELECT 3 as num')

    Promise.allSettled([p1, p2, p3]).then((results) => {
      // First query should succeed
      assert.equal(results[0].status, 'fulfilled')
      assert.equal(results[0].value.rows[0].num, '1')

      // Second query should fail
      assert.equal(results[1].status, 'rejected')
      assert.ok(results[1].reason instanceof Error)

      // Third query should succeed despite second failing
      assert.equal(results[2].status, 'fulfilled')
      assert.equal(results[2].value.rows[0].num, '3')

      client.end(done)
    })
  })
})

suite.test('pipeline mode - transactions work correctly', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Create temp table and run transaction
    client
      .query('CREATE TEMP TABLE pipeline_test (id serial, value text)')
      .then(() => client.query('BEGIN'))
      .then(() => client.query("INSERT INTO pipeline_test (value) VALUES ('test1') RETURNING id"))
      .then((r) => {
        assert.ok(r.rows[0].id, 'Should return inserted id')
        return client.query("INSERT INTO pipeline_test (value) VALUES ('test2') RETURNING id")
      })
      .then(() => client.query('COMMIT'))
      .then(() => client.query('SELECT COUNT(*) as count FROM pipeline_test'))
      .then((r) => {
        assert.equal(r.rows[0].count, '2', 'Should have 2 rows after commit')
        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - transaction rollback', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    client
      .query('CREATE TEMP TABLE pipeline_rollback_test (id serial, value text)')
      .then(() => client.query('BEGIN'))
      .then(() => client.query("INSERT INTO pipeline_rollback_test (value) VALUES ('test1')"))
      .then(() => client.query('ROLLBACK'))
      .then(() => client.query('SELECT COUNT(*) as count FROM pipeline_rollback_test'))
      .then((r) => {
        assert.equal(r.rows[0].count, '0', 'Should have 0 rows after rollback')
        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - prepared statements', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // In pipeline mode, we need to use different names for concurrent prepared statements
    // or execute them sequentially. Here we use sequential execution.
    client
      .query({
        name: 'get-number-1',
        text: 'SELECT $1::int as num',
        values: [1],
      })
      .then((r1) => {
        assert.equal(r1.rows[0].num, 1)
        // Now reuse the same prepared statement
        return client.query({
          name: 'get-number-1',
          text: 'SELECT $1::int as num',
          values: [2],
        })
      })
      .then((r2) => {
        assert.equal(r2.rows[0].num, 2)
        return client.query({
          name: 'get-number-1',
          text: 'SELECT $1::int as num',
          values: [3],
        })
      })
      .then((r3) => {
        assert.equal(r3.rows[0].num, 3)
        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - concurrent prepared statements with same name', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Test that concurrent prepared statements with the same name work correctly
    // The client should only send Parse once and reuse it for subsequent queries
    const promises = [
      client.query({
        name: 'concurrent-test',
        text: 'SELECT $1::int as num',
        values: [1],
      }),
      client.query({
        name: 'concurrent-test',
        text: 'SELECT $1::int as num',
        values: [2],
      }),
      client.query({
        name: 'concurrent-test',
        text: 'SELECT $1::int as num',
        values: [3],
      }),
    ]

    Promise.all(promises)
      .then((results) => {
        assert.equal(results[0].rows[0].num, 1)
        assert.equal(results[1].rows[0].num, 2)
        assert.equal(results[2].rows[0].num, 3)
        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - handles queries with semicolons in string literals', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Query with semicolon inside a string - should work fine
    client
      .query("SELECT ';' as semicolon")
      .then((r) => {
        assert.equal(r.rows[0].semicolon, ';', 'Should handle semicolon in string literal')
        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - multi-statement queries fail at server level', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Multi-statement queries are rejected by PostgreSQL in extended query protocol
    // The server returns an error, not the client
    client.query('SELECT 1; SELECT 2').catch((err) => {
      assert.ok(err instanceof Error, 'Should receive an error from server')
      // The error message comes from PostgreSQL
      client.end(done)
    })
  })
})

suite.test('pipeline mode - many concurrent queries', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    const numQueries = 50
    const promises = []

    for (let i = 0; i < numQueries; i++) {
      promises.push(
        client.query('SELECT $1::int as num', [i]).then((r) => ({
          expected: i,
          actual: parseInt(r.rows[0].num),
        }))
      )
    }

    Promise.all(promises).then((results) => {
      // Verify all queries returned correct results
      results.forEach((r) => {
        assert.equal(r.actual, r.expected, `Query ${r.expected} should return ${r.expected}`)
      })
      client.end(done)
    })
  })
})

suite.test('pipeline mode - client.end() waits for pending queries', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    let queryCompleted = false

    // Start a query that takes some time
    client.query('SELECT pg_sleep(0.1), 1 as num').then((r) => {
      queryCompleted = true
      assert.equal(r.rows[0].num, '1')
    })

    // Immediately call end - should wait for query to complete
    client.end(() => {
      assert.ok(queryCompleted, 'Query should have completed before end() callback')
      done()
    })
  })
})

suite.test('pipeline mode - pipelineMode property returns true', (done) => {
  const client = new Client({ pipelineMode: true })
  assert.equal(client.pipelineMode, true, 'pipelineMode should be true')
  client.connect((err) => {
    if (err) return done(err)
    assert.equal(client.pipelineMode, true, 'pipelineMode should still be true after connect')
    client.end(done)
  })
})

suite.test('non-pipeline mode - pipelineMode property returns false', (done) => {
  const client = new Client({ pipelineMode: false })
  assert.equal(client.pipelineMode, false, 'pipelineMode should be false')
  client.connect((err) => {
    if (err) return done(err)
    assert.equal(client.pipelineMode, false, 'pipelineMode should still be false after connect')
    client.end(done)
  })
})

suite.test('default client - pipelineMode property returns false', (done) => {
  const client = new Client()
  assert.equal(client.pipelineMode, false, 'pipelineMode should default to false')
  client.connect((err) => {
    if (err) return done(err)
    client.end(done)
  })
})

suite.test('pipeline mode - row events are emitted', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    const query = new pg.Query('SELECT generate_series(1, 3) as num')
    const rows = []

    query.on('row', (row) => {
      rows.push(row.num)
    })

    query.on('end', () => {
      assert.deepEqual(rows, ['1', '2', '3'], 'Should receive all rows via events')
      client.end(done)
    })

    client.query(query)
  })
})

suite.test('pipeline mode - handles NULL values correctly', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    Promise.all([
      client.query('SELECT NULL as val'),
      client.query('SELECT 1 as val'),
      client.query('SELECT NULL as val'),
    ]).then((results) => {
      assert.equal(results[0].rows[0].val, null)
      assert.equal(results[1].rows[0].val, '1')
      assert.equal(results[2].rows[0].val, null)
      client.end(done)
    })
  })
})

suite.test('pipeline mode - handles empty result sets', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    client
      .query('CREATE TEMP TABLE empty_test (id int)')
      .then(() => client.query('SELECT * FROM empty_test'))
      .then((r) => {
        assert.equal(r.rows.length, 0, 'Should return empty array')
        assert.ok(r.fields, 'Should have fields metadata')
        client.end(done)
      })
  })
})

suite.test('pipeline mode - connection remains usable after error', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Cause an error
    client
      .query('SELECT * FROM this_table_does_not_exist')
      .catch(() => {
        // Error expected, now verify connection still works
        return client.query('SELECT 42 as answer')
      })
      .then((r) => {
        assert.equal(r.rows[0].answer, '42', 'Connection should still work after error')
        client.end(done)
      })
  })
})

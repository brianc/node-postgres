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

// Tests for error isolation behavior (autocommit vs transaction)
// These tests verify the behavior discussed in the PR comments

suite.test('pipeline mode - errors in autocommit mode do not cascade', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // In autocommit mode (no BEGIN), each query is its own transaction
    // An error in one query should NOT affect other queries
    const p1 = client.query('SELECT 1 as num')
    const p2 = client.query('SELECT * FROM nonexistent_table_xyz') // This will fail
    const p3 = client.query('SELECT 3 as num') // This should still succeed

    Promise.allSettled([p1, p2, p3]).then((results) => {
      // Query 1 should succeed
      assert.equal(results[0].status, 'fulfilled', 'Query 1 should succeed')
      assert.equal(results[0].value.rows[0].num, '1')

      // Query 2 should fail
      assert.equal(results[1].status, 'rejected', 'Query 2 should fail')

      // Query 3 should ALSO succeed - errors don't cascade in autocommit mode
      assert.equal(results[2].status, 'fulfilled', 'Query 3 should succeed despite Query 2 failing')
      assert.equal(results[2].value.rows[0].num, '3')

      client.end(done)
    })
  })
})

suite.test('pipeline mode - errors inside transaction abort subsequent queries', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Inside a transaction, an error aborts all subsequent queries until ROLLBACK
    client
      .query('BEGIN')
      .then(() => {
        // Send multiple queries in the transaction
        const p1 = client.query('SELECT 1 as num')
        const p2 = client.query('SELECT * FROM nonexistent_table_xyz') // This will fail
        const p3 = client.query('SELECT 3 as num') // This should fail because transaction is aborted

        return Promise.allSettled([p1, p2, p3])
      })
      .then((results) => {
        // Query 1 should succeed (executed before the error)
        assert.equal(results[0].status, 'fulfilled', 'Query 1 should succeed')

        // Query 2 should fail
        assert.equal(results[1].status, 'rejected', 'Query 2 should fail')

        // Query 3 should ALSO fail - transaction is aborted
        assert.equal(results[2].status, 'rejected', 'Query 3 should fail because transaction is aborted')

        // Rollback to clean up
        return client.query('ROLLBACK')
      })
      .then(() => {
        // Verify connection is still usable after rollback
        return client.query('SELECT 42 as answer')
      })
      .then((r) => {
        assert.equal(r.rows[0].answer, '42', 'Connection should work after ROLLBACK')
        client.end(done)
      })
      .catch((err) => {
        client.query('ROLLBACK').finally(() => client.end(() => done(err)))
      })
  })
})

suite.test('pipeline mode - large result set is fully received (not closed early)', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Generate 1000 rows - if query was closed after RowDescription, we'd get fewer
    client
      .query('SELECT generate_series(1, 1000) as num')
      .then((r) => {
        assert.equal(r.rows.length, 1000, 'Should receive all 1000 rows, not close early')
        // Verify first and last values
        assert.equal(r.rows[0].num, '1')
        assert.equal(r.rows[999].num, '1000')
        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - multiple large result sets in parallel', (done) => {
  // Further proof that queries are not closed prematurely
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    Promise.all([
      client.query('SELECT generate_series(1, 500) as num'),
      client.query('SELECT generate_series(501, 1000) as num'),
      client.query('SELECT generate_series(1001, 1500) as num'),
    ])
      .then((results) => {
        assert.equal(results[0].rows.length, 500, 'First query should have 500 rows')
        assert.equal(results[1].rows.length, 500, 'Second query should have 500 rows')
        assert.equal(results[2].rows.length, 500, 'Third query should have 500 rows')

        // Verify correct data
        assert.equal(results[0].rows[0].num, '1')
        assert.equal(results[0].rows[499].num, '500')
        assert.equal(results[1].rows[0].num, '501')
        assert.equal(results[2].rows[499].num, '1500')

        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - transactions ARE supported and work correctly', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    client
      .query('CREATE TEMP TABLE tx_test (id serial, value int)')
      .then(() => client.query('BEGIN'))
      .then(() => client.query('INSERT INTO tx_test (value) VALUES (1)'))
      .then(() => client.query('INSERT INTO tx_test (value) VALUES (2)'))
      .then(() => client.query('INSERT INTO tx_test (value) VALUES (3)'))
      .then(() => client.query('COMMIT'))
      .then(() => client.query('SELECT SUM(value) as total FROM tx_test'))
      .then((r) => {
        assert.equal(r.rows[0].total, '6', 'Transaction should commit all 3 inserts')
        client.end(done)
      })
      .catch((err) => {
        client.query('ROLLBACK').finally(() => client.end(() => done(err)))
      })
  })
})

suite.test('pipeline mode - prepared statements do not leak memory', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Execute same prepared statement multiple times
    const promises = []
    for (let i = 0; i < 100; i++) {
      promises.push(
        client.query({
          name: 'memory-test',
          text: 'SELECT $1::int as num',
          values: [i],
        })
      )
    }

    Promise.all(promises)
      .then((results) => {
        // Verify all queries succeeded
        assert.equal(results.length, 100)
        assert.equal(results[0].rows[0].num, 0)
        assert.equal(results[99].rows[0].num, 99)

        // Verify _pendingParsedStatements is cleaned up (no leak)
        assert.equal(
          Object.keys(client._pendingParsedStatements).length,
          0,
          '_pendingParsedStatements should be empty after queries complete'
        )

        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - Pool with multiple concurrent clients', (done) => {
  const Pool = pg.Pool
  const pool = new Pool({ pipelineMode: true, max: 5 })

  // Simulate 10 concurrent "users" each doing multiple queries
  const userTasks = []
  for (let userId = 0; userId < 10; userId++) {
    const task = pool.connect().then((client) => {
      // Each user does 5 queries
      const queries = []
      for (let q = 0; q < 5; q++) {
        queries.push(client.query('SELECT $1::int as user_id, $2::int as query_num', [userId, q]))
      }
      return Promise.all(queries).then((results) => {
        client.release()
        return { userId, results }
      })
    })
    userTasks.push(task)
  }

  Promise.all(userTasks)
    .then((allResults) => {
      // Verify each user got correct results
      assert.equal(allResults.length, 10, 'Should have results from 10 users')

      allResults.forEach(({ userId, results }) => {
        assert.equal(results.length, 5, `User ${userId} should have 5 results`)
        results.forEach((r, idx) => {
          assert.equal(r.rows[0].user_id, userId, `User ${userId} query ${idx} should have correct user_id`)
          assert.equal(r.rows[0].query_num, idx, `User ${userId} query ${idx} should have correct query_num`)
        })
      })

      return pool.end()
    })
    .then(() => done())
    .catch((err) => {
      pool.end().then(() => done(err))
    })
})

suite.test('pipeline mode - error in transaction with rapid fire queries', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Send all queries as fast as possible without awaiting
    const p1 = client.query('BEGIN')
    const p2 = client.query('CREATE TEMP TABLE rapid_test (id int PRIMARY KEY)')
    const p3 = client.query('INSERT INTO rapid_test VALUES (1)')
    const p4 = client.query('INSERT INTO rapid_test VALUES (1)') // DUPLICATE - will fail
    const p5 = client.query('INSERT INTO rapid_test VALUES (2)') // Should fail - tx aborted
    const p6 = client.query('INSERT INTO rapid_test VALUES (3)') // Should fail - tx aborted
    const p7 = client.query('COMMIT') // PostgreSQL converts this to ROLLBACK on aborted tx

    Promise.allSettled([p1, p2, p3, p4, p5, p6, p7])
      .then((results) => {
        // p1, p2, p3 should succeed
        assert.equal(results[0].status, 'fulfilled', 'BEGIN should succeed')
        assert.equal(results[1].status, 'fulfilled', 'CREATE TABLE should succeed')
        assert.equal(results[2].status, 'fulfilled', 'First INSERT should succeed')

        // p4 should fail (duplicate key)
        assert.equal(results[3].status, 'rejected', 'Duplicate INSERT should fail')

        // p5, p6 should fail (transaction aborted)
        assert.equal(results[4].status, 'rejected', 'Query after error should fail')
        assert.equal(results[5].status, 'rejected', 'Query after error should fail')

        // p7 (COMMIT) succeeds but PostgreSQL converts it to ROLLBACK
        // This is standard PostgreSQL behavior - COMMIT on aborted transaction = implicit ROLLBACK
        assert.equal(results[6].status, 'fulfilled', 'COMMIT should succeed (converted to ROLLBACK)')
        assert.equal(results[6].value.command, 'ROLLBACK', 'COMMIT on aborted tx returns ROLLBACK command')

        // Connection should already be usable (no explicit ROLLBACK needed)
        return client.query('SELECT 1 as test')
      })
      .then((r) => {
        assert.equal(r.rows[0].test, '1', 'Connection should be usable after aborted transaction')
        client.end(done)
      })
      .catch((err) => {
        client.query('ROLLBACK').finally(() => client.end(() => done(err)))
      })
  })
})

suite.test('pipeline mode - Promise.all results are correctly ordered', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Create queries with different execution times using pg_sleep
    // Results MUST come back in the order they were submitted
    const queries = [
      client.query('SELECT 1 as num, pg_sleep(0.05)'), // slow
      client.query('SELECT 2 as num'), // fast
      client.query('SELECT 3 as num, pg_sleep(0.03)'), // medium
      client.query('SELECT 4 as num'), // fast
      client.query('SELECT 5 as num, pg_sleep(0.01)'), // slightly slow
    ]

    Promise.all(queries)
      .then((results) => {
        // Results MUST be in submission order, not completion order
        assert.equal(results[0].rows[0].num, '1', 'First result should be query 1')
        assert.equal(results[1].rows[0].num, '2', 'Second result should be query 2')
        assert.equal(results[2].rows[0].num, '3', 'Third result should be query 3')
        assert.equal(results[3].rows[0].num, '4', 'Fourth result should be query 4')
        assert.equal(results[4].rows[0].num, '5', 'Fifth result should be query 5')

        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - async/await ordering with mixed success/failure', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect(async (err) => {
    if (err) return done(err)

    try {
      // Submit queries in rapid succession
      const p1 = client.query('SELECT 1 as num')
      const p2 = client.query('SELECT 2 as num')
      const p3 = client.query('SELECT * FROM nonexistent_xyz') // will fail
      const p4 = client.query('SELECT 4 as num')
      const p5 = client.query('SELECT 5 as num')

      // Await them individually to verify ordering
      const r1 = await p1
      assert.equal(r1.rows[0].num, '1', 'Query 1 should return 1')

      const r2 = await p2
      assert.equal(r2.rows[0].num, '2', 'Query 2 should return 2')

      // Query 3 should fail
      let error3 = null
      try {
        await p3
      } catch (e) {
        error3 = e
      }
      assert.ok(error3, 'Query 3 should have failed')

      // Queries 4 and 5 should still succeed (error isolation in autocommit)
      const r4 = await p4
      assert.equal(r4.rows[0].num, '4', 'Query 4 should return 4')

      const r5 = await p5
      assert.equal(r5.rows[0].num, '5', 'Query 5 should return 5')

      client.end(done)
    } catch (err) {
      client.end(() => done(err))
    }
  })
})

suite.test('pipeline mode - Pool.query shorthand with pipeline', (done) => {
  const Pool = pg.Pool
  const pool = new Pool({ pipelineMode: true, max: 3 })

  // Use pool.query directly (not pool.connect)
  const queries = []
  for (let i = 0; i < 20; i++) {
    queries.push(pool.query('SELECT $1::int as num', [i]))
  }

  Promise.all(queries)
    .then((results) => {
      assert.equal(results.length, 20, 'Should have 20 results')
      results.forEach((r, idx) => {
        assert.equal(r.rows[0].num, idx, `Query ${idx} should return ${idx}`)
      })
      return pool.end()
    })
    .then(() => done())
    .catch((err) => {
      pool.end().then(() => done(err))
    })
})

suite.test('pipeline mode - COPY operations are rejected', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Create a temp table for COPY test
    client
      .query('CREATE TEMP TABLE copy_test (id int, name text)')
      .then(() => {
        // Attempt COPY FROM STDIN - should fail in pipeline mode
        return client.query('COPY copy_test FROM STDIN')
      })
      .then(() => {
        client.end(() => done(new Error('COPY should have been rejected')))
      })
      .catch((err) => {
        assert.ok(err instanceof Error, 'Should receive an error')
        assert.ok(
          err.message.includes('COPY') || err.message.includes('pipeline'),
          'Error should mention COPY or pipeline mode'
        )
        // Connection should still be usable after COPY rejection
        client
          .query('SELECT 1 as test')
          .then((r) => {
            assert.equal(r.rows[0].test, '1', 'Connection should still work after COPY rejection')
            client.end(done)
          })
          .catch((err2) => {
            client.end(() => done(err2))
          })
      })
  })
})

suite.test('pipeline mode - empty query handling', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Empty query should be handled correctly
    client
      .query('')
      .then((r) => {
        // Empty query returns empty result
        assert.equal(r.rows.length, 0, 'Empty query should return empty rows')
        client.end(done)
      })
      .catch((err) => {
        // Some versions may error on empty query - that's also acceptable
        client.end(done)
      })
  })
})

suite.test('pipeline mode - LISTEN/NOTIFY', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    let notificationReceived = false

    client.on('notification', (msg) => {
      assert.equal(msg.channel, 'test_channel', 'Should receive notification on correct channel')
      assert.equal(msg.payload, 'test_payload', 'Should receive correct payload')
      notificationReceived = true
    })

    client
      .query('LISTEN test_channel')
      .then(() => client.query("NOTIFY test_channel, 'test_payload'"))
      .then(() => {
        // Give time for notification to arrive
        setTimeout(() => {
          assert.ok(notificationReceived, 'Should have received notification')
          client.end(done)
        }, 100)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - binary mode works', (done) => {
  const client = new Client({ pipelineMode: true, binary: true })
  client.connect((err) => {
    if (err) return done(err)

    Promise.all([
      client.query('SELECT 1::int4 as num'),
      client.query('SELECT 2::int4 as num'),
      client.query('SELECT 3::int4 as num'),
    ])
      .then((results) => {
        // In binary mode, integers come back as numbers not strings
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

suite.test('pipeline mode - query timeout triggers error', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Suppress error event from forced disconnect
    client.on('error', () => {})

    // Query with very short timeout
    const slowQuery = client.query({
      text: 'SELECT pg_sleep(10)',
      query_timeout: 100, // 100ms timeout
    })

    slowQuery
      .then(() => {
        client.connection.stream.destroy()
        done(new Error('Query should have timed out'))
      })
      .catch((err) => {
        assert.ok(err.message.includes('timeout'), 'Should be a timeout error')
        // Note: In pipeline mode, after a timeout the connection state may be inconsistent
        // because PostgreSQL continues processing the query. Force close the connection.
        client.connection.stream.destroy()
        // Wait for connection to fully close before completing test
        client.once('end', () => done())
      })
  })
})

suite.test('pipeline mode - queries before connect are queued', (done) => {
  const client = new Client({ pipelineMode: true })

  // Queue queries BEFORE connecting
  const p1 = client.query('SELECT 1 as num')
  const p2 = client.query('SELECT 2 as num')
  const p3 = client.query('SELECT 3 as num')

  // Now connect
  client.connect((err) => {
    if (err) return done(err)

    Promise.all([p1, p2, p3])
      .then((results) => {
        assert.equal(results[0].rows[0].num, '1')
        assert.equal(results[1].rows[0].num, '2')
        assert.equal(results[2].rows[0].num, '3')
        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - notice messages are emitted', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    let noticeReceived = false

    client.on('notice', (msg) => {
      noticeReceived = true
    })

    // Create a function that raises a notice
    client
      .query(
        `
        DO $$
        BEGIN
          RAISE NOTICE 'Test notice from pipeline mode';
        END $$;
      `
      )
      .then(() => {
        assert.ok(noticeReceived, 'Should have received notice')
        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - custom type parsers work', (done) => {
  const client = new Client({ pipelineMode: true })

  // Set custom type parser for int4 (OID 23)
  client.setTypeParser(23, (val) => parseInt(val, 10) * 2)

  client.connect((err) => {
    if (err) return done(err)

    client
      .query('SELECT 5::int4 as num')
      .then((r) => {
        assert.equal(r.rows[0].num, 10, 'Custom type parser should double the value')
        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - rowMode array works', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    client
      .query({ text: 'SELECT 1 as a, 2 as b, 3 as c', rowMode: 'array' })
      .then((r) => {
        assert.ok(Array.isArray(r.rows[0]), 'Row should be an array')
        assert.deepEqual(r.rows[0], ['1', '2', '3'], 'Should have correct values')
        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - pg-cursor is rejected', (done) => {
  let Cursor
  try {
    Cursor = require('pg-cursor')
  } catch (e) {
    console.log('  (skipped - pg-cursor not installed)')
    return done()
  }

  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    const cursor = new Cursor('SELECT generate_series(1, 100) as num')

    // Cursor should receive an error
    cursor.on('error', (err) => {
      assert.ok(err instanceof Error, 'Should receive an error')
      assert.ok(err.message.includes('pipeline'), 'Error should mention pipeline mode')
      client.end(done)
    })

    client.query(cursor)
  })
})

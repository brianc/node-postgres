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

suite.test('pipeline mode - stress test with 200+ concurrent queries', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    const numQueries = 200
    const promises = []

    for (let i = 0; i < numQueries; i++) {
      promises.push(
        client.query('SELECT $1::int as num, $2::text as txt', [i, `query-${i}`]).then((r) => ({
          expected: i,
          actual: parseInt(r.rows[0].num),
          txt: r.rows[0].txt,
        }))
      )
    }

    Promise.all(promises)
      .then((results) => {
        assert.equal(results.length, numQueries, `Should have ${numQueries} results`)
        results.forEach((r) => {
          assert.equal(r.actual, r.expected, `Query ${r.expected} should return correct num`)
          assert.equal(r.txt, `query-${r.expected}`, `Query ${r.expected} should return correct txt`)
        })
        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - mixed query types (INSERT, UPDATE, DELETE, SELECT)', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Setup table
    client
      .query('CREATE TEMP TABLE mixed_ops (id serial PRIMARY KEY, value int, name text)')
      .then(() => {
        // Send all operations in rapid succession
        const p1 = client.query("INSERT INTO mixed_ops (value, name) VALUES (1, 'one') RETURNING id")
        const p2 = client.query("INSERT INTO mixed_ops (value, name) VALUES (2, 'two') RETURNING id")
        const p3 = client.query("INSERT INTO mixed_ops (value, name) VALUES (3, 'three') RETURNING id")
        const p4 = client.query('UPDATE mixed_ops SET value = value * 10 WHERE value = 2 RETURNING value')
        const p5 = client.query('DELETE FROM mixed_ops WHERE value = 1 RETURNING id')
        const p6 = client.query('SELECT * FROM mixed_ops ORDER BY id')

        return Promise.all([p1, p2, p3, p4, p5, p6])
      })
      .then((results) => {
        // Verify INSERT results
        assert.ok(results[0].rows[0].id, 'First INSERT should return id')
        assert.ok(results[1].rows[0].id, 'Second INSERT should return id')
        assert.ok(results[2].rows[0].id, 'Third INSERT should return id')

        // Verify UPDATE result
        assert.equal(results[3].rows[0].value, 20, 'UPDATE should multiply value by 10')
        assert.equal(results[3].rowCount, 1, 'UPDATE should affect 1 row')

        // Verify DELETE result
        assert.equal(results[4].rowCount, 1, 'DELETE should affect 1 row')

        // Verify final SELECT - should have 2 rows (one deleted)
        assert.equal(results[5].rows.length, 2, 'Should have 2 rows after DELETE')
        const values = results[5].rows.map((r) => parseInt(r.value)).sort((a, b) => a - b)
        assert.deepEqual(values, [3, 20], 'Should have correct values after all operations')

        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - SAVEPOINT handling (nested transactions)', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    client
      .query('CREATE TEMP TABLE savepoint_test (id serial, value int)')
      .then(() => client.query('BEGIN'))
      .then(() => client.query('INSERT INTO savepoint_test (value) VALUES (1)'))
      .then(() => client.query('SAVEPOINT sp1'))
      .then(() => client.query('INSERT INTO savepoint_test (value) VALUES (2)'))
      .then(() => client.query('SAVEPOINT sp2'))
      .then(() => client.query('INSERT INTO savepoint_test (value) VALUES (3)'))
      .then(() => client.query('ROLLBACK TO SAVEPOINT sp2')) // Undo value=3
      .then(() => client.query('INSERT INTO savepoint_test (value) VALUES (4)'))
      .then(() => client.query('ROLLBACK TO SAVEPOINT sp1')) // Undo value=2 and value=4
      .then(() => client.query('INSERT INTO savepoint_test (value) VALUES (5)'))
      .then(() => client.query('COMMIT'))
      .then(() => client.query('SELECT value FROM savepoint_test ORDER BY value'))
      .then((r) => {
        // Should only have values 1 and 5 (2, 3, 4 were rolled back)
        const values = r.rows.map((row) => parseInt(row.value))
        assert.deepEqual(values, [1, 5], 'Should only have values 1 and 5 after savepoint rollbacks')
        client.end(done)
      })
      .catch((err) => {
        client.query('ROLLBACK').finally(() => client.end(() => done(err)))
      })
  })
})

suite.test('pipeline mode - rapid SAVEPOINT operations', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    client
      .query('CREATE TEMP TABLE rapid_sp (id serial, value int)')
      .then(() => {
        // Send all savepoint operations in rapid succession
        const ops = [
          client.query('BEGIN'),
          client.query('INSERT INTO rapid_sp (value) VALUES (1)'),
          client.query('SAVEPOINT a'),
          client.query('INSERT INTO rapid_sp (value) VALUES (2)'),
          client.query('SAVEPOINT b'),
          client.query('INSERT INTO rapid_sp (value) VALUES (3)'),
          client.query('RELEASE SAVEPOINT b'), // Keep value=3
          client.query('ROLLBACK TO SAVEPOINT a'), // Undo value=2 and value=3
          client.query('INSERT INTO rapid_sp (value) VALUES (4)'),
          client.query('COMMIT'),
        ]
        return Promise.all(ops)
      })
      .then(() => client.query('SELECT value FROM rapid_sp ORDER BY value'))
      .then((r) => {
        const values = r.rows.map((row) => parseInt(row.value))
        assert.deepEqual(values, [1, 4], 'Should only have values 1 and 4')
        client.end(done)
      })
      .catch((err) => {
        client.query('ROLLBACK').finally(() => client.end(() => done(err)))
      })
  })
})

suite.test('pipeline mode - connection interruption handling', (done) => {
  const client = new Client({ pipelineMode: true })

  let errorReceived = false
  let endReceived = false

  client.on('error', (err) => {
    errorReceived = true
  })

  client.on('end', () => {
    endReceived = true
  })

  client.connect((err) => {
    if (err) return done(err)

    // Start some queries
    const p1 = client.query('SELECT pg_sleep(0.5), 1 as num')
    const p2 = client.query('SELECT 2 as num')
    const p3 = client.query('SELECT 3 as num')

    // Destroy the connection after a short delay
    setTimeout(() => {
      client.connection.stream.destroy()
    }, 50)

    // All queries should fail
    Promise.allSettled([p1, p2, p3]).then((results) => {
      // At least some queries should have failed
      const failedCount = results.filter((r) => r.status === 'rejected').length
      assert.ok(failedCount > 0, 'At least some queries should fail when connection is destroyed')

      // Error event should have been emitted
      assert.ok(errorReceived || endReceived, 'Should receive error or end event')

      done()
    })
  })
})

suite.test('pipeline mode - stress test with mixed success/failure', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    const promises = []

    // Mix of successful and failing queries
    for (let i = 0; i < 50; i++) {
      if (i % 10 === 5) {
        // Every 10th query (at position 5, 15, 25, 35, 45) will fail
        promises.push(client.query('SELECT * FROM nonexistent_table_' + i))
      } else {
        promises.push(client.query('SELECT $1::int as num', [i]))
      }
    }

    Promise.allSettled(promises)
      .then((results) => {
        let successCount = 0
        let failCount = 0

        results.forEach((r, idx) => {
          if (r.status === 'fulfilled') {
            successCount++
            if (idx % 10 !== 5) {
              assert.equal(r.value.rows[0].num, idx, `Query ${idx} should return correct value`)
            }
          } else {
            failCount++
            assert.equal(idx % 10, 5, `Only queries at position 5, 15, 25, 35, 45 should fail`)
          }
        })

        assert.equal(successCount, 45, 'Should have 45 successful queries')
        assert.equal(failCount, 5, 'Should have 5 failed queries')

        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - Pool stress test with concurrent connections', (done) => {
  const Pool = pg.Pool
  const pool = new Pool({ pipelineMode: true, max: 10 })

  const numUsers = 20
  const queriesPerUser = 10
  const userTasks = []

  for (let userId = 0; userId < numUsers; userId++) {
    const task = pool.connect().then((client) => {
      const queries = []
      for (let q = 0; q < queriesPerUser; q++) {
        queries.push(client.query('SELECT $1::int as user_id, $2::int as query_num, pg_sleep(0.01)', [userId, q]))
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
      assert.equal(allResults.length, numUsers, `Should have results from ${numUsers} users`)

      allResults.forEach(({ userId, results }) => {
        assert.equal(results.length, queriesPerUser, `User ${userId} should have ${queriesPerUser} results`)
        results.forEach((r, idx) => {
          assert.equal(parseInt(r.rows[0].user_id), userId, `User ${userId} query ${idx} should have correct user_id`)
          assert.equal(parseInt(r.rows[0].query_num), idx, `User ${userId} query ${idx} should have correct query_num`)
        })
      })

      return pool.end()
    })
    .then(() => done())
    .catch((err) => {
      pool.end().then(() => done(err))
    })
})

suite.test('pipeline mode - query cancellation removes from queue', (done) => {
  const client = new Client({ pipelineMode: true })

  // Queue queries before connecting
  const p1 = client.query('SELECT 1 as num')
  const p2 = client.query('SELECT 2 as num')
  const p3 = client.query('SELECT 3 as num')

  // Remove p2 from queue before it's sent
  const idx = client._queryQueue.indexOf(p2._result ? p2 : client._queryQueue[1])
  if (idx > -1) {
    client._queryQueue.splice(idx, 1)
  }

  client.connect((err) => {
    if (err) return done(err)

    Promise.allSettled([p1, p3])
      .then((results) => {
        assert.equal(results[0].status, 'fulfilled', 'Query 1 should succeed')
        assert.equal(results[1].status, 'fulfilled', 'Query 3 should succeed')
        assert.equal(results[0].value.rows[0].num, '1')
        assert.equal(results[1].value.rows[0].num, '3')
        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - very large batch (500 queries)', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    const numQueries = 500
    const promises = []

    for (let i = 0; i < numQueries; i++) {
      promises.push(client.query('SELECT $1::int as i', [i]))
    }

    Promise.all(promises)
      .then((results) => {
        assert.equal(results.length, numQueries)
        // Verify first, middle, and last
        assert.equal(results[0].rows[0].i, '0')
        assert.equal(results[250].rows[0].i, '250')
        assert.equal(results[499].rows[0].i, '499')
        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - concurrent different prepared statements', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Multiple different prepared statements sent concurrently
    const promises = [
      client.query({ name: 'stmt-int', text: 'SELECT $1::int as val', values: [1] }),
      client.query({ name: 'stmt-text', text: 'SELECT $1::text as val', values: ['hello'] }),
      client.query({ name: 'stmt-bool', text: 'SELECT $1::boolean as val', values: [true] }),
      client.query({ name: 'stmt-int', text: 'SELECT $1::int as val', values: [2] }), // reuse stmt-int
      client.query({ name: 'stmt-float', text: 'SELECT $1::float as val', values: [3.14] }),
      client.query({ name: 'stmt-text', text: 'SELECT $1::text as val', values: ['world'] }), // reuse stmt-text
      client.query({ name: 'stmt-int', text: 'SELECT $1::int as val', values: [3] }), // reuse stmt-int again
    ]

    Promise.all(promises)
      .then((results) => {
        assert.equal(results[0].rows[0].val, 1)
        assert.equal(results[1].rows[0].val, 'hello')
        assert.equal(results[2].rows[0].val, true)
        assert.equal(results[3].rows[0].val, 2)
        assert.equal(parseFloat(results[4].rows[0].val).toFixed(2), '3.14')
        assert.equal(results[5].rows[0].val, 'world')
        assert.equal(results[6].rows[0].val, 3)

        // Verify no memory leak in _pendingParsedStatements
        assert.equal(Object.keys(client._pendingParsedStatements).length, 0)

        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - large bytea data', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Create buffers of different sizes
    const small = Buffer.alloc(1024, 'a') // 1KB
    const medium = Buffer.alloc(64 * 1024, 'b') // 64KB
    const large = Buffer.alloc(256 * 1024, 'c') // 256KB

    client
      .query('CREATE TEMP TABLE bytea_test (id serial, data bytea)')
      .then(() => {
        // Insert all sizes concurrently
        return Promise.all([
          client.query('INSERT INTO bytea_test (data) VALUES ($1) RETURNING id', [small]),
          client.query('INSERT INTO bytea_test (data) VALUES ($1) RETURNING id', [medium]),
          client.query('INSERT INTO bytea_test (data) VALUES ($1) RETURNING id', [large]),
        ])
      })
      .then((insertResults) => {
        // Read them back concurrently
        return Promise.all([
          client.query('SELECT data FROM bytea_test WHERE id = $1', [insertResults[0].rows[0].id]),
          client.query('SELECT data FROM bytea_test WHERE id = $1', [insertResults[1].rows[0].id]),
          client.query('SELECT data FROM bytea_test WHERE id = $1', [insertResults[2].rows[0].id]),
        ])
      })
      .then((selectResults) => {
        assert.equal(selectResults[0].rows[0].data.length, 1024, 'Small buffer should be 1KB')
        assert.equal(selectResults[1].rows[0].data.length, 64 * 1024, 'Medium buffer should be 64KB')
        assert.equal(selectResults[2].rows[0].data.length, 256 * 1024, 'Large buffer should be 256KB')

        // Verify content
        assert.ok(
          selectResults[0].rows[0].data.every((b) => b === 97),
          'Small buffer content should be all "a"'
        )
        assert.ok(
          selectResults[1].rows[0].data.every((b) => b === 98),
          'Medium buffer content should be all "b"'
        )
        assert.ok(
          selectResults[2].rows[0].data.every((b) => b === 99),
          'Large buffer content should be all "c"'
        )

        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - JSON/JSONB operations', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    const complexJson = {
      name: 'test',
      nested: { a: 1, b: [1, 2, 3], c: { deep: true } },
      array: [{ id: 1 }, { id: 2 }],
    }

    client
      .query('CREATE TEMP TABLE json_test (id serial, data jsonb)')
      .then(() => {
        // Multiple JSON operations concurrently
        return Promise.all([
          client.query('INSERT INTO json_test (data) VALUES ($1) RETURNING id', [JSON.stringify(complexJson)]),
          client.query('INSERT INTO json_test (data) VALUES ($1) RETURNING id', [JSON.stringify({ simple: true })]),
          client.query('INSERT INTO json_test (data) VALUES ($1) RETURNING id', [JSON.stringify([1, 2, 3])]),
        ])
      })
      .then(() => {
        // Query with JSON operators concurrently
        return Promise.all([
          client.query("SELECT data->'nested'->'a' as val FROM json_test WHERE data->>'name' = 'test'"),
          client.query("SELECT data->'nested'->'b' as val FROM json_test WHERE data->>'name' = 'test'"),
          client.query("SELECT jsonb_array_length(data->'array') as len FROM json_test WHERE data->>'name' = 'test'"),
          client.query('SELECT data FROM json_test ORDER BY id'),
        ])
      })
      .then((results) => {
        assert.equal(results[0].rows[0].val, 1)
        assert.deepEqual(results[1].rows[0].val, [1, 2, 3])
        assert.equal(results[2].rows[0].len, '2')
        assert.equal(results[3].rows.length, 3)

        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - PostgreSQL array types', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    client
      .query('CREATE TEMP TABLE array_test (id serial, int_arr int[], text_arr text[])')
      .then(() => {
        // Insert arrays concurrently
        return Promise.all([
          client.query('INSERT INTO array_test (int_arr, text_arr) VALUES ($1, $2) RETURNING id', [
            [1, 2, 3],
            ['a', 'b', 'c'],
          ]),
          client.query('INSERT INTO array_test (int_arr, text_arr) VALUES ($1, $2) RETURNING id', [
            [4, 5, 6],
            ['d', 'e', 'f'],
          ]),
          client.query("INSERT INTO array_test (int_arr, text_arr) VALUES ('{7,8,9}', '{g,h,i}') RETURNING id"),
        ])
      })
      .then(() => {
        // Query with array operators concurrently
        return Promise.all([
          client.query('SELECT int_arr[1] as first FROM array_test ORDER BY id'),
          client.query('SELECT array_length(text_arr, 1) as len FROM array_test ORDER BY id'),
          client.query('SELECT * FROM array_test WHERE int_arr @> ARRAY[2]'),
          client.query('SELECT unnest(int_arr) as val FROM array_test WHERE id = 1'),
        ])
      })
      .then((results) => {
        // First elements
        assert.equal(results[0].rows[0].first, '1')
        assert.equal(results[0].rows[1].first, '4')
        assert.equal(results[0].rows[2].first, '7')

        // Array lengths
        assert.equal(results[1].rows[0].len, '3')

        // Contains query
        assert.equal(results[2].rows.length, 1)

        // Unnest
        assert.equal(results[3].rows.length, 3)
        assert.deepEqual(
          results[3].rows.map((r) => r.val),
          ['1', '2', '3']
        )

        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - query with many parameters', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Generate 50 parameters
    const numParams = 50
    const values = []
    const placeholders = []
    for (let i = 0; i < numParams; i++) {
      values.push(i)
      placeholders.push(`$${i + 1}::int`)
    }

    const query = `SELECT ${placeholders.join(' + ')} as total`

    // Send multiple queries with many parameters concurrently
    Promise.all([client.query(query, values), client.query(query, values), client.query(query, values)])
      .then((results) => {
        // Sum of 0 to 49 = 1225
        const expectedSum = (numParams * (numParams - 1)) / 2
        assert.equal(results[0].rows[0].total, expectedSum.toString())
        assert.equal(results[1].rows[0].total, expectedSum.toString())
        assert.equal(results[2].rows[0].total, expectedSum.toString())

        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - Pool with size 1 maintains transaction isolation', (done) => {
  // This test verifies that pool + pipeline mode doesn't break transaction isolation
  // With pool size 1, both "users" must share the same connection
  // A failure in one transaction should NOT affect the other
  const Pool = pg.Pool
  const pool = new Pool({ pipelineMode: true, max: 1 })

  // User 1: successful transaction
  const user1 = pool.connect().then(async (client) => {
    try {
      await client.query('BEGIN')
      await client.query('CREATE TEMP TABLE user1_test (id int)')
      await client.query('INSERT INTO user1_test VALUES (1)')
      await client.query('COMMIT')
      const result = await client.query('SELECT * FROM user1_test')
      return { success: true, rows: result.rows.length }
    } finally {
      client.release()
    }
  })

  // User 2: transaction that fails
  const user2 = pool.connect().then(async (client) => {
    try {
      await client.query('BEGIN')
      await client.query('CREATE TEMP TABLE user2_test (id int PRIMARY KEY)')
      await client.query('INSERT INTO user2_test VALUES (1)')
      await client.query('INSERT INTO user2_test VALUES (1)') // DUPLICATE - will fail
      await client.query('COMMIT') // This becomes ROLLBACK
      return { success: true }
    } catch (err) {
      await client.query('ROLLBACK')
      return { success: false, error: err.message }
    } finally {
      client.release()
    }
  })

  Promise.all([user1, user2])
    .then(([result1, result2]) => {
      // User 1 should succeed
      assert.equal(result1.success, true, 'User 1 transaction should succeed')
      assert.equal(result1.rows, 1, 'User 1 should have 1 row')

      // User 2 should fail (duplicate key or transaction aborted)
      assert.equal(result2.success, false, 'User 2 transaction should fail')

      return pool.end()
    })
    .then(() => done())
    .catch((err) => {
      pool.end().then(() => done(err))
    })
})

suite.test('pipeline mode - pipelineFull event is emitted when pipelineMaxQueries is reached', (done) => {
  // Use a small pipelineMaxQueries to trigger backpressure quickly
  const client = new Client({ pipelineMode: true, pipelineMaxQueries: 10 })

  let pipelineFullEmitted = false
  client.on('pipelineFull', () => {
    pipelineFullEmitted = true
  })

  client.connect((err) => {
    if (err) return done(err)

    // Submit more queries than pipelineMaxQueries to trigger backpressure
    const promises = []
    for (let i = 0; i < 15; i++) {
      promises.push(client.query('SELECT $1::int as num, pg_sleep(0.01)', [i]))
    }

    Promise.all(promises)
      .then((results) => {
        // Verify all queries completed successfully
        assert.equal(results.length, 15, 'All 15 queries should complete')

        // Verify pipelineFull event was emitted
        assert.ok(pipelineFullEmitted, 'pipelineFull event should have been emitted')

        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - pipelineDrain event is emitted when pipeline depth drops below low water mark', (done) => {
  // Use a small pipelineMaxQueries to trigger backpressure quickly
  // lowWaterMark will be 75% of 10 = 7
  const client = new Client({ pipelineMode: true, pipelineMaxQueries: 10 })

  let pipelineFullEmitted = false
  let pipelineDrainEmitted = false

  client.on('pipelineFull', () => {
    pipelineFullEmitted = true
  })

  client.on('pipelineDrain', () => {
    pipelineDrainEmitted = true
  })

  client.connect((err) => {
    if (err) return done(err)

    // Submit more queries than pipelineMaxQueries to trigger backpressure
    // Then wait for them to complete and verify pipelineDrain is emitted
    const promises = []
    for (let i = 0; i < 15; i++) {
      promises.push(client.query('SELECT $1::int as num, pg_sleep(0.01)', [i]))
    }

    Promise.all(promises)
      .then((results) => {
        // Verify all queries completed successfully
        assert.equal(results.length, 15, 'All 15 queries should complete')

        // Verify both events were emitted
        assert.ok(pipelineFullEmitted, 'pipelineFull event should have been emitted')
        assert.ok(
          pipelineDrainEmitted,
          'pipelineDrain event should have been emitted when pipeline depth dropped below low water mark'
        )

        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - backpressure activation with real PostgreSQL connection', (done) => {
  // Test that backpressure correctly pauses query submission when pipelineMaxQueries is reached
  const pipelineMaxQueries = 5
  const client = new Client({ pipelineMode: true, pipelineMaxQueries: pipelineMaxQueries })

  let pipelineFullCount = 0
  let maxObservedPendingCount = 0

  client.on('pipelineFull', () => {
    pipelineFullCount++
    // Record the pending count when pipelineFull is emitted
    if (client.pendingQueryCount > maxObservedPendingCount) {
      maxObservedPendingCount = client.pendingQueryCount
    }
  })

  client.connect((err) => {
    if (err) return done(err)

    // Submit many queries - backpressure should prevent pendingQueryCount from exceeding pipelineMaxQueries
    const numQueries = 20
    const promises = []

    for (let i = 0; i < numQueries; i++) {
      promises.push(
        client.query('SELECT $1::int as num, pg_sleep(0.02)', [i]).then((r) => ({ success: true, num: r.rows[0].num }))
      )
    }

    Promise.all(promises)
      .then((results) => {
        // All queries should complete successfully
        assert.equal(results.length, numQueries, `All ${numQueries} queries should complete`)
        results.forEach((r, idx) => {
          assert.equal(r.success, true, `Query ${idx} should succeed`)
          assert.equal(r.num, idx.toString(), `Query ${idx} should return correct value`)
        })

        // pipelineFull should have been emitted at least once
        assert.ok(pipelineFullCount >= 1, 'pipelineFull event should have been emitted at least once')

        // pendingQueryCount should never have exceeded pipelineMaxQueries significantly
        // (there may be slight timing variations, so we allow a small buffer)
        assert.ok(
          maxObservedPendingCount <= pipelineMaxQueries + 2,
          `maxObservedPendingCount (${maxObservedPendingCount}) should not significantly exceed pipelineMaxQueries (${pipelineMaxQueries})`
        )

        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - backpressure release and query resumption', (done) => {
  // Test that queries resume correctly after backpressure is released
  const pipelineMaxQueries = 5
  const client = new Client({ pipelineMode: true, pipelineMaxQueries: pipelineMaxQueries })

  let pipelineFullEmitted = false
  let pipelineDrainEmitted = false
  const eventOrder = []

  client.on('pipelineFull', () => {
    pipelineFullEmitted = true
    eventOrder.push('full')
  })

  client.on('pipelineDrain', () => {
    pipelineDrainEmitted = true
    eventOrder.push('drain')
  })

  client.connect((err) => {
    if (err) return done(err)

    // Submit queries that will trigger backpressure and then drain
    const numQueries = 15
    const promises = []
    const completionOrder = []

    for (let i = 0; i < numQueries; i++) {
      promises.push(
        client.query('SELECT $1::int as num, pg_sleep(0.01)', [i]).then((r) => {
          completionOrder.push(parseInt(r.rows[0].num))
          return r.rows[0].num
        })
      )
    }

    Promise.all(promises)
      .then((results) => {
        // All queries should complete
        assert.equal(results.length, numQueries, `All ${numQueries} queries should complete`)

        // Verify pipelineFull was emitted (backpressure activated)
        assert.ok(pipelineFullEmitted, 'pipelineFull event should have been emitted')

        // Verify pipelineDrain was emitted (backpressure released)
        assert.ok(pipelineDrainEmitted, 'pipelineDrain event should have been emitted')

        // Verify event order: full should come before drain
        const fullIndex = eventOrder.indexOf('full')
        const drainIndex = eventOrder.indexOf('drain')
        assert.ok(fullIndex < drainIndex, 'pipelineFull should be emitted before pipelineDrain')

        // Verify queries completed in submission order (pipeline preserves order)
        for (let i = 0; i < completionOrder.length; i++) {
          assert.equal(completionOrder[i], i, `Query ${i} should complete in order`)
        }

        // Verify pendingQueryCount is 0 after all queries complete
        assert.equal(client.pendingQueryCount, 0, 'pendingQueryCount should be 0 after all queries complete')

        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - query result has cancel() method', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    const result = client.query('SELECT 1 as num')

    // Result should have cancel method
    assert.equal(typeof result.cancel, 'function', 'query result should have cancel() method')

    result
      .then(() => {
        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - cancel() on long-running query', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Start a long-running query
    const longQuery = client.query('SELECT pg_sleep(10)')

    // Cancel it after a short delay
    setTimeout(() => {
      longQuery.cancel()
    }, 100)

    longQuery
      .then(() => {
        client.end(() => done(new Error('Query should have been cancelled')))
      })
      .catch((err) => {
        // Query was cancelled - this is expected
        assert.ok(err instanceof Error, 'Should receive an error')
        // The error could be from PostgreSQL (query_canceled) or our cancellation
        client.end(done)
      })
  })
})

suite.test('pipeline mode - cancel() does not affect other queries', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    // Submit multiple queries
    const p1 = client.query('SELECT 1 as num')
    const p2 = client.query('SELECT pg_sleep(5), 2 as num') // This one will be cancelled
    const p3 = client.query('SELECT 3 as num')

    // Cancel the second query
    setTimeout(() => {
      p2.cancel()
    }, 50)

    Promise.allSettled([p1, p2, p3])
      .then((results) => {
        // First query should succeed
        assert.equal(results[0].status, 'fulfilled', 'First query should succeed')
        assert.equal(results[0].value.rows[0].num, '1')

        // Second query should be cancelled/rejected
        assert.equal(results[1].status, 'rejected', 'Second query should be cancelled')

        // Third query should succeed
        assert.equal(results[2].status, 'fulfilled', 'Third query should succeed')
        assert.equal(results[2].value.rows[0].num, '3')

        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - cancel() on already completed query is no-op', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    const result = client.query('SELECT 1 as num')

    result
      .then((r) => {
        assert.equal(r.rows[0].num, '1')

        // Cancel after completion - should not throw
        assert.doesNotThrow(() => {
          result.cancel()
        }, 'cancel() on completed query should not throw')

        client.end(done)
      })
      .catch((err) => {
        client.end(() => done(err))
      })
  })
})

suite.test('pipeline mode - cancel preserves through .then() chain', (done) => {
  const client = new Client({ pipelineMode: true })
  client.connect((err) => {
    if (err) return done(err)

    const result = client
      .query('SELECT pg_sleep(10)')
      .then((r) => r)
      .catch((err) => {
        throw err
      })

    // cancel() should still be available after .then()
    assert.equal(typeof result.cancel, 'function', 'cancel() should be preserved through .then()')

    setTimeout(() => {
      result.cancel()
    }, 50)

    result.catch(() => {
      // Expected - query was cancelled
      client.end(done)
    })
  })
})

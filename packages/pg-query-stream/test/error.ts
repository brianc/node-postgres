import assert from 'assert'
import helper from './helper'
import QueryStream from '../src'
import { Pool, Client } from 'pg'

helper('error', function (client) {
  it('receives error on stream', function (done) {
    const stream = new QueryStream('SELECT * FROM asdf num', [])
    const query = client.query(stream)
    query
      .on('error', function (err) {
        assert(err)
        assert.equal(err.code, '42P01')
        done()
      })
      .on('data', function () {
        // noop to kick of reading
      })
  })

  it('continues to function after stream', function (done) {
    client.query('SELECT NOW()', done)
  })
})

describe('error recovery', () => {
  // created from https://github.com/chrisdickinson/pg-test-case
  it('recovers from a streaming error in a transaction', async () => {
    const pool = new Pool()
    const client = await pool.connect()
    await client.query(`CREATE TEMP TABLE frobnicators (
      id serial primary key,
      updated timestamp
    )`)
    await client.query(`BEGIN;`)
    const query = new QueryStream(`INSERT INTO frobnicators ("updated") VALUES ($1) RETURNING "id"`, [Date.now()])
    let error: Error | undefined = undefined
    query.on('data', console.log).on('error', (e) => {
      error = e
    })
    client.query(query) // useless callback necessitated by an older version of honeycomb-beeline

    await client.query(`ROLLBACK`)
    assert(error, 'Error should not be undefined')
    const { rows } = await client.query('SELECT NOW()')
    assert.strictEqual(rows.length, 1)
    client.release()
    const client2 = await pool.connect()
    await client2.query(`BEGIN`)
    client2.release()
    pool.end()
  })

  // created from https://github.com/brianc/node-postgres/pull/2333
  it('handles an error on a stream after a plain text non-stream error', async () => {
    const client = new Client()
    const stmt = 'SELECT * FROM goose;'
    await client.connect()
    return new Promise((resolve, reject) => {
      client.query(stmt).catch((e) => {
        assert(e, 'Query should have rejected with an error')
        const stream = new QueryStream('SELECT * FROM duck')
        client.query(stream)
        stream.on('data', () => {})
        stream.on('error', () => {
          client.end((err) => {
            err ? reject(err) : resolve()
          })
        })
      })
    })
  })

  it('does not crash when closing a connection with a queued stream', async () => {
    const client = new Client()
    const stmt = 'SELECT * FROM goose;'
    await client.connect()
    return new Promise(async (resolve) => {
      let queryError: Error | undefined
      client.query(stmt).catch((e) => {
        queryError = e
      })
      const stream = client.query(new QueryStream(stmt))
      stream.on('data', () => {})
      stream.on('error', () => {
        assert(queryError, 'query should have errored due to client ending')
        resolve()
      })
      await client.end()
    })
  })

  it.only('should work if used after timeout error', async () => {
    const pool = new Pool({ max: 1, connectionTimeoutMillis: 400, statement_timeout: 400 });

    const res1 = await pool.query('SELECT 1 AS a');
    assert.deepStrictEqual(res1.rows, [ { a:1 } ]);

    const query = new QueryStream('SELECT 2 AS b');
    const client = await pool.connect();
    const stream = await client.query(query);

    await assert.rejects(() => pool.query('SELECT TRUE'), { message: 'timeout exceeded when trying to connect' });

    await stream.destroy();
    if(process.env.WAIT_AFTER_CLOSE === '1') await new Promise(resolve => setTimeout(resolve, 100));

    if(process.env.WAIT_AFTER_CLOSE === '2') {
      await new Promise(resolve => stream.once('close', resolve));
    }

    await client.release();

    const res2 = await pool.query('SELECT 4 AS d');
    assert.deepStrictEqual(res2.rows, [ { d:4 } ]);

    await pool.end();
  })

  it.only('should work if used after syntax error', async () => {
    const pool = new Pool({ max: 1, statement_timeout: 100 }); // statement_timeout is required here, so maybe this is just another timeout error?

    const res1 = await pool.query('SELECT 1 AS a');
    assert.deepStrictEqual(res1.rows, [ { a:1 } ]);

    const query = new QueryStream('SELECT 2 AS b');
    const client = await pool.connect();
    const stream = await client.query(query);

    await new Promise(resolve => setTimeout(resolve, 10));

    await stream.destroy();
    if(process.env.WAIT_AFTER_CLOSE === '1') await new Promise(resolve => setTimeout(resolve, 100));

    if(process.env.WAIT_AFTER_CLOSE === '2') {
      await new Promise(resolve => stream.once('close', resolve));
    }

    await client.release();

    const res2 = await pool.query('SELECT 4 AS d');
    assert.deepStrictEqual(res2.rows, [ { d:4 } ]);

    await pool.end();
  })
})

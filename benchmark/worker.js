'use strict'

// One arm: loads the packages at PG_BENCH_MODULE and stays up, so compare.js can alternate the
// two arms scenario by scenario. Each message names a scenario and a duration, the reply is the
// queries per second it reached. The arms never share a heap or a JIT.

const path = require('path')

const root = path.resolve(process.env.PG_BENCH_MODULE)
const pg = require(path.join(root, 'packages/pg'))
const Cursor = require(path.join(root, 'packages/pg-cursor'))
const QueryStream = require(path.join(root, 'packages/pg-query-stream'))

const BATCH = 10
const ROWS = 500
// the scratch table holds one range of ids per arm, so the arms' deletes never meet
const ARMS = 4
const SCRATCH_PER_ARM = 200000
const scratchFrom = Number(process.env.PG_BENCH_ARM || 0) * SCRATCH_PER_ARM + 1

// one column per family of pg-types parser, so a row parse pays for every conversion
const COLUMNS = `id int, small smallint, big bigint, real_value real, double_value double precision,
  numeric_value numeric(12, 4), string_value text, varchar_value varchar(20), null_value text,
  bool_value boolean, ts timestamptz, day date, json_value json, jsonb_value jsonb, uuid_value uuid,
  int_array int[], text_array text[], bytea_value bytea`
const COUNT = 18
// the columns with nothing to convert beyond the row itself, for the protocol-only scenarios
const SIMPLE = 'id, small, string_value, null_value, bool_value'
const ROW = `i, i, i * 100000, i / 3.0, i / 7.0, i / 11.0, 'wat', 'varchar', NULL, i % 2 = 0,
  now(), current_date, '{"a": 1}', '{"b": [1, 2]}', gen_random_uuid(), ARRAY[i, i + 1], ARRAY['x', 'y'], '\\xdeadbeef'`

// reads every field of every row, so the result is really consumed, and checks the shape
const consume = (rows, count = COUNT) => {
  for (const row of rows) {
    let seen = 0
    for (const key in row) if (row[key] !== undefined) seen++
    if (seen !== count) throw new Error(`expected ${count} fields, got ${seen}`)
  }
  return 1
}

const select = (limit, columns = '*') => ({
  text: `SELECT ${columns} FROM benchmark_rows ORDER BY id LIMIT ${limit}`,
  name: `benchmark_${limit}_${columns === '*' ? 'all' : 'simple'}`,
})

// what the parameterized writes send: one value per family of parameter encoding
const values = () => [
  1,
  2,
  '3000000000',
  1.5,
  2.25,
  '12.3456',
  'wat',
  'varchar',
  null,
  true,
  new Date(),
  '2024-01-02',
  { a: 1 },
  { b: [1, 2] },
  '00000000-0000-4000-8000-000000000000',
  [1, 2, 3],
  ['x', 'y'],
  Buffer.from('deadbeef', 'hex'),
]
const placeholders = values()
  .map((_, i) => `$${i + 1}`)
  .join(', ')

// each scenario runs one iteration and returns how many queries it ran
const scenarios = ({ client, pipelined, pool }) => {
  let deleted = 0
  let updated = 0
  return {
    'select 1 row, all types, prepared': async () => consume((await client.query(select(1))).rows),
    'select 100 rows, all types, prepared': async () => consume((await client.query(select(100))).rows),
    'select 500 rows, all types, prepared': async () => consume((await client.query(select(ROWS))).rows),
    'select 500 rows, simple types, prepared': async () => consume((await client.query(select(ROWS, SIMPLE))).rows, 5),
    'select 500 rows, simple types, array mode': async () =>
      consume((await client.query({ ...select(ROWS, SIMPLE), rowMode: 'array' })).rows, 5),
    'select 500 rows, simple types, binary': async () =>
      consume((await client.query({ ...select(ROWS, SIMPLE), binary: true })).rows, 5),
    // unnamed, so parse and bind are paid on every query
    'select by id, parameterized': async () =>
      consume((await client.query('SELECT * FROM benchmark_rows WHERE id = $1', [42])).rows),
    'insert, all types, returning': async () =>
      consume(
        (await client.query(`INSERT INTO benchmark_scratch VALUES (${placeholders}) RETURNING *`, values())).rows
      ),
    'update, parameterized': async () => {
      const id = scratchFrom + SCRATCH_PER_ARM - 1 - (updated++ % 1000)
      await client.query('UPDATE benchmark_scratch SET small = $1, string_value = $2, ts = $3 WHERE id = $4', [
        7,
        'updated',
        new Date(),
        id,
      ])
      return 1
    },
    'delete, parameterized': async () => {
      await client.query('DELETE FROM benchmark_scratch WHERE id = $1', [scratchFrom + deleted++])
      return 1
    },
    // begin and commit go through the simple query protocol, the insert through the extended one
    'transaction, 3 queries': async () => {
      await client.query('BEGIN')
      await client.query(`INSERT INTO benchmark_scratch (id, small, string_value) VALUES ($1, $2, $3)`, [0, 1, 'tx'])
      await client.query('COMMIT')
      return 3
    },
    'pool query, select 1 row': async () => consume((await pool.query(select(1))).rows),
    'cursor, 500 rows in 5 reads': async () => {
      const cursor = client.query(new Cursor(select(ROWS).text))
      let rows
      do {
        rows = await cursor.read(100)
        consume(rows)
      } while (rows.length > 0)
      await cursor.close()
      return 1
    },
    'query stream, 500 rows': async () => {
      const rows = []
      for await (const row of client.query(new QueryStream(select(ROWS).text))) rows.push(row)
      consume(rows)
      return 1
    },
    [`select 100 rows, all types, pipelined x${BATCH}`]: async () => {
      const batch = await Promise.all(Array.from({ length: BATCH }, () => pipelined.query(select(100))))
      for (const res of batch) consume(res.rows)
      return BATCH
    },
  }
}

const measure = async (fn, ms) => {
  // what the previous measurement left behind is not this one's to collect. The collections
  // inside the window stay: a change that allocates more pays for it here, as it does in production
  global.gc()
  let count = 0
  const start = process.hrtime.bigint()
  let elapsed = 0
  while (elapsed < ms) {
    count += await fn()
    elapsed = Number(process.hrtime.bigint() - start) / 1e6
  }
  return (count * 1000) / elapsed
}

const setup = async (client) => {
  await client.query('DROP TABLE IF EXISTS benchmark_rows, benchmark_scratch')
  await client.query(`CREATE TABLE benchmark_rows (${COLUMNS}, PRIMARY KEY (id))`)
  await client.query(`INSERT INTO benchmark_rows SELECT ${ROW} FROM generate_series(1, ${ROWS}) i`)
  await client.query('CREATE UNLOGGED TABLE benchmark_scratch (LIKE benchmark_rows)')
  await client.query('CREATE INDEX ON benchmark_scratch (id)')
  await client.query(
    `INSERT INTO benchmark_scratch (id, small, string_value) SELECT i, i % 1000, 'x' FROM generate_series(1, ${
      ARMS * SCRATCH_PER_ARM
    }) i`
  )
}

const main = async () => {
  const client = new pg.Client()
  const pipelined = new pg.Client({ pipeline: true })
  const pool = new pg.Pool({ max: 2 })
  await client.connect()
  await pipelined.connect()
  const all = scenarios({ client, pipelined, pool })

  process.on('message', async (msg) => {
    try {
      if (msg.type === 'setup') {
        await setup(client)
        process.send({ ok: true })
      } else if (msg.type === 'run') {
        process.send({ ok: true, qps: await measure(all[msg.scenario], msg.ms) })
      } else if (msg.type === 'end') {
        await Promise.all([client.end(), pipelined.end(), pool.end()])
        process.send({ ok: true }, () => process.exit(0))
      }
    } catch (err) {
      process.send({ ok: false, error: String(err.stack || err) })
    }
  })
  process.send({ ok: true, scenarios: Object.keys(all) })
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`)
  process.exit(1)
})

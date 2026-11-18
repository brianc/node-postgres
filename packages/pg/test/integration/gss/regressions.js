'use strict'

const assert = require('assert')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const root = '/work/fixture'
const password = crypto.randomBytes(24).toString('hex')
const Current = require('/work/current/packages/pg/lib')
const results = []

async function setup() {
  const admin = new Current.Client({
    host: path.join(root, 'socket'),
    port: 55439,
    user: 'postgres',
    database: 'postgres',
  })
  await admin.connect()
  try {
    await admin.query(
      `CREATE ROLE passwordrepro LOGIN PASSWORD '${password}'; CREATE ROLE scramrepro LOGIN PASSWORD '${password}';`
    )
    fs.writeFileSync(
      path.join(root, 'pgdata', 'pg_hba.conf'),
      'local all all trust\n' +
        'hostssl gssrepro passwordrepro 127.0.0.1/32 password\n' +
        'hostssl gssrepro scramrepro 127.0.0.1/32 scram-sha-256\n' +
        'host all all 127.0.0.1/32 gss include_realm=1 map=fixture\n'
    )
    await admin.query('SELECT pg_reload_conf()')
  } finally {
    await admin.end()
  }
}

async function ordinaryAuth(stage, role, invalid) {
  const { Client } = require(`/work/${stage}/packages/pg/lib`)
  const client = new Client({
    host: 'localhost',
    port: 55439,
    database: 'gssrepro',
    user: role,
    password: async () => (invalid ? 'deliberately-invalid' : password),
    ssl: { ca: fs.readFileSync(path.join(root, 'ca.crt'), 'utf8'), rejectUnauthorized: true },
    enableChannelBinding: true,
    connectionTimeoutMillis: 3000,
  })
  try {
    if (invalid) {
      await assert.rejects(client.connect(), (error) => error.code === '28P01')
      return { stage, role, invalid, outcome: 'expected-rejection' }
    }
    await client.connect()
    const query = await client.query('SELECT $1::integer AS answer', [42])
    assert.strictEqual(query.rows[0].answer, 42)
    assert.strictEqual(client.connection.stream.authorized, true)
    return { stage, role, invalid, outcome: 'passed', answer: 42 }
  } finally {
    await client.end()
  }
}

async function cursorAndTransactions() {
  const Cursor = require('pg-cursor')
  const client = new Current.Client({
    host: 'localhost',
    port: 55439,
    database: 'gssrepro',
    user: 'pgrepro',
    ssl: { ca: fs.readFileSync(path.join(root, 'ca.crt'), 'utf8'), rejectUnauthorized: true },
    connectionTimeoutMillis: 3000,
  })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query('CREATE TEMP TABLE session_control(value integer)')
    await client.query('INSERT INTO session_control VALUES (42)')
    await client.query('COMMIT')
    assert.strictEqual((await client.query('SELECT value FROM session_control')).rows[0].value, 42)
    const cursor = client.query(new Cursor('SELECT n FROM generate_series(1, 10) AS n ORDER BY n'))
    const values = []
    try {
      let rows
      do {
        rows = await new Promise((resolve, reject) =>
          cursor.read(3, (error, rows) => (error ? reject(error) : resolve(rows)))
        )
        values.push(...rows.map((row) => row.n))
      } while (rows.length > 0)
    } finally {
      await new Promise((resolve, reject) => cursor.close((error) => (error ? reject(error) : resolve())))
    }
    assert.deepStrictEqual(values, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    assert.strictEqual((await client.query('SELECT 42 AS answer')).rows[0].answer, 42)
    return { stage: 'after', scenario: 'gss-cursor-and-transaction-affinity', outcome: 'passed', rows: values.length }
  } finally {
    await client.end()
  }
}

async function main() {
  await setup()
  for (const stage of ['before', 'current']) {
    for (const role of ['passwordrepro', 'scramrepro']) {
      for (const invalid of [false, true]) {
        results.push(await ordinaryAuth(stage, role, invalid))
      }
    }
  }
  results.push(await cursorAndTransactions())
  fs.writeFileSync('/work/ordinary-auth-and-stream-regressions.json', JSON.stringify({ results }, null, 2))
  console.log(JSON.stringify({ ordinaryBeforeAfterCases: 8, gssCursorAndTransactionCase: 1, allPassed: true }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

'use strict'

// Random queries for the two fuzzers that need a server: what to send, and one canonical text
// for what came back, so two arms compare as strings.
//
// A round is a short sequence of statements on one connection: selects over generate_series
// with a column per type family, sometimes as a parameter instead of a literal, and writes on a
// temp table so the command tags and row counts of INSERT, UPDATE and DELETE are covered too.
// Some statements fail on purpose, a few of them only after rows were already sent.

const { int, pick, chance, string, bytes, canon } = require('./lib')

const quote = (s) => `'${s.replace(/'/g, "''")}'`
// how pg writes an array parameter, so a literal and a parameter carry the same value
const arrayLiteral = (items) =>
  `{${items
    .map((v) =>
      v === null ? 'NULL' : Array.isArray(v) ? arrayLiteral(v) : `"${String(v).replace(/(["\\])/g, '\\$1')}"`
    )
    .join(',')}}`

const ints = (rng, bits) => {
  const max = 2 ** (bits - 1) - 1
  return pick(rng, [0, 1, -1, 42, max, -max - 1, int(rng, -1000, 1000), int(rng, -max, max)])
}
const floats = (rng) =>
  pick(rng, [0, -0, 1.5, -2.25, 1e-7, 123456.789, 1e300, -1e-300, rng() * 1000, 'NaN', 'Infinity', '-Infinity'])
const numerics = (rng) =>
  pick(rng, [
    '0',
    '-0.00',
    '1.5',
    '123456789012345678901234567890.123456789',
    '-0.000001',
    'NaN',
    String(int(rng, -99999, 99999)),
  ])
const texts = (rng) => string(rng, 20)
const dates = (rng) =>
  pick(rng, ['2024-02-29', '1970-01-01', '0001-01-01', '9999-12-31', '2000-01-01', 'infinity', '-infinity'])
const stamps = (rng) =>
  pick(rng, [
    '2024-02-29 12:34:56.789',
    '1969-12-31 23:59:59.999999',
    '2000-01-01 00:00:00',
    '1900-06-15 01:02:03.5',
    'infinity',
  ])
const jsons = (rng) =>
  pick(rng, ['{}', '[]', 'null', '1', '"x"', '{"a":[1,2,{"b":null}],"c":"é"}', '[1.5,true,"\\u00e9"]', '{"k":"a\\"b"}'])
const uuid = () => '123e4567-e89b-12d3-a456-426614174000'
// flat most of the time, sometimes two levels of the same width, which is what an array type takes
const arrayOf = (rng, item) => {
  const n = chance(rng, 0.15) ? 0 : int(rng, 1, 5)
  const one = () => Array.from({ length: n }, () => (chance(rng, 0.15) ? null : item(rng)))
  return chance(rng, 0.15) && n > 0 ? [one(), one()] : one()
}
const hex = (rng) => `\\x${bytes(rng, 8).toString('hex')}`

// one entry per type family. `literal` is a SQL expression, `param` a JS value pg sends for it,
// `binary` says whether the binary result format gives the same JS value as the text one, which
// is only true for the types pg-types has a binary parser for, or decodes as utf8 anyway
const TYPES = [
  { type: 'int2', binary: true, literal: (rng) => `${ints(rng, 16)}::int2`, param: (rng) => ints(rng, 16) },
  { type: 'int4', binary: true, literal: (rng) => `${ints(rng, 32)}::int4`, param: (rng) => ints(rng, 32) },
  { type: 'int8', binary: true, literal: (rng) => `${ints(rng, 53)}::int8`, param: (rng) => String(ints(rng, 53)) },
  {
    type: 'float8',
    binary: true,
    literal: (rng) => `${quote(String(floats(rng)))}::float8`,
    param: (rng) => floats(rng),
  },
  {
    type: 'float4',
    binary: false,
    literal: (rng) => `${quote(String(floats(rng)))}::float4`,
    param: (rng) => floats(rng),
  },
  {
    type: 'numeric',
    binary: false,
    literal: (rng) => `${quote(numerics(rng))}::numeric`,
    param: (rng) => numerics(rng),
  },
  { type: 'bool', binary: true, literal: (rng) => pick(rng, ['true', 'false']), param: (rng) => chance(rng, 0.5) },
  { type: 'text', binary: true, literal: (rng) => `${quote(texts(rng))}::text`, param: (rng) => texts(rng) },
  { type: 'varchar', binary: true, literal: (rng) => `${quote(texts(rng))}::varchar(30)`, param: (rng) => texts(rng) },
  {
    type: 'char',
    binary: true,
    literal: (rng) => `${quote(texts(rng).slice(0, 4))}::char(6)`,
    param: (rng) => texts(rng).slice(0, 4),
  },
  { type: 'name', binary: true, literal: (rng) => `${quote(texts(rng))}::name`, param: (rng) => texts(rng) },
  // pg-native gets a Buffer parameter as a C string, cut at its first zero byte (#980), so the
  // arm that compares against it draws no Buffer parameter
  {
    type: 'bytea',
    binary: false,
    literal: (rng) => `${quote(hex(rng))}::bytea`,
    param: (rng) => bytes(rng, 8),
    buffer: true,
  },
  { type: 'date', binary: false, literal: (rng) => `${quote(dates(rng))}::date`, param: (rng) => dates(rng) },
  {
    type: 'timestamp',
    binary: false,
    literal: (rng) => `${quote(stamps(rng))}::timestamp`,
    param: (rng) => stamps(rng),
  },
  {
    type: 'timestamptz',
    binary: false,
    literal: (rng) => `${quote(stamps(rng))}::timestamptz`,
    param: (rng) => stamps(rng),
  },
  { type: 'time', binary: false, literal: () => `'12:34:56.789'::time`, param: () => '12:34:56.789' },
  {
    type: 'interval',
    binary: false,
    literal: (rng) =>
      `${quote(pick(rng, ['1 day', '-3 hours 2 minutes', '1 year 2 mons 3 days 04:05:06.789', '0']))}::interval`,
  },
  {
    type: 'json',
    binary: false,
    literal: (rng) => `${quote(jsons(rng))}::json`,
    param: (rng) => JSON.parse(jsons(rng)),
  },
  {
    type: 'jsonb',
    binary: false,
    literal: (rng) => `${quote(jsons(rng))}::jsonb`,
    param: (rng) => JSON.parse(jsons(rng)),
  },
  { type: 'uuid', binary: false, literal: () => `${quote(uuid())}::uuid`, param: () => uuid() },
  {
    type: 'oid',
    binary: true,
    literal: (rng) => `${int(rng, 0, 2147483647)}::oid`,
    param: (rng) => int(rng, 0, 2147483647),
  },
  {
    type: 'int4[]',
    binary: false,
    literal: (rng) => `${quote(arrayLiteral(arrayOf(rng, (r) => ints(r, 32))))}::int4[]`,
    param: (rng) => arrayOf(rng, (r) => ints(r, 32)),
  },
  {
    type: 'int8[]',
    binary: false,
    literal: (rng) => `${quote(arrayLiteral(arrayOf(rng, (r) => ints(r, 53))))}::int8[]`,
    param: (rng) => arrayOf(rng, (r) => String(ints(r, 53))),
  },
  {
    type: 'float8[]',
    binary: false,
    literal: (rng) => `${quote(arrayLiteral(arrayOf(rng, floats)))}::float8[]`,
    param: (rng) => arrayOf(rng, floats),
  },
  {
    type: 'text[]',
    binary: true,
    literal: (rng) => `${quote(arrayLiteral(arrayOf(rng, texts)))}::text[]`,
    param: (rng) => arrayOf(rng, texts),
  },
  {
    type: 'bool[]',
    binary: false,
    literal: (rng) => `${quote(arrayLiteral(arrayOf(rng, (r) => chance(r, 0.5))))}::bool[]`,
    param: (rng) => arrayOf(rng, (r) => chance(r, 0.5)),
  },
  {
    type: 'timestamptz[]',
    binary: false,
    literal: (rng) => `${quote(arrayLiteral(arrayOf(rng, stamps)))}::timestamptz[]`,
  },
  {
    type: 'numeric[]',
    binary: false,
    literal: (rng) => `${quote(arrayLiteral(arrayOf(rng, numerics)))}::numeric[]`,
    param: (rng) => arrayOf(rng, numerics),
  },
  { type: 'jsonb[]', binary: false, literal: (rng) => `${quote(arrayLiteral(arrayOf(rng, jsons)))}::jsonb[]` },
  { type: 'bytea[]', binary: false, literal: (rng) => `${quote(arrayLiteral(arrayOf(rng, hex)))}::bytea[]` },
  { type: 'uuid[]', binary: false, literal: (rng) => `${quote(arrayLiteral(arrayOf(rng, uuid)))}::uuid[]` },
  { type: 'point', binary: false, literal: (rng) => `point(${int(rng, -10, 10)}, ${rng() * 10})` },
  {
    type: 'inet',
    binary: false,
    literal: (rng) => `${quote(pick(rng, ['127.0.0.1', '10.0.0.0/8', '::1', 'fe80::1/64']))}::inet`,
  },
  {
    type: 'int4range',
    binary: false,
    literal: (rng) => `${quote(pick(rng, ['[1,10)', 'empty', '(,)', '[5,5]']))}::int4range`,
  },
  { type: 'record', binary: false, literal: (rng) => `ROW(${ints(rng, 32)}, ${quote(texts(rng))}, NULL)` },
  { type: 'unknown', binary: true, literal: (rng) => quote(texts(rng)) },
  { type: 'null', binary: true, literal: () => 'NULL', param: () => null },
  // something that changes with the row, so a result is not one value repeated
  { type: 'row', binary: true, literal: () => 'g' },
  { type: 'rowtext', binary: true, literal: () => `'r' || g::text` },
]

// the ways a statement can fail: a text nothing can run, an expression that fails before any
// row, and one that fails only once some rows were already sent
const FAILURES = [
  { text: 'SELEC 1' },
  { column: '1/0' },
  { column: `'abc'::int4` },
  { column: 'nosuchcol' },
  { column: 'CASE WHEN g > 3 THEN 1/0 ELSE 1 END' },
]

const drawSelect = (rng, { buffers }) => {
  const columns = []
  for (let i = int(rng, 1, 8); i > 0; i--) {
    const t = pick(rng, TYPES)
    columns.push(
      t.param && (buffers || !t.buffer) && chance(rng, 0.35)
        ? { sql: `::${t.type}`, param: t.param(rng), binary: t.binary }
        : { sql: t.literal(rng), binary: t.binary }
    )
  }
  const failure = chance(rng, 0.15) ? pick(rng, FAILURES) : null
  if (failure && failure.column) columns.splice(int(rng, 0, columns.length), 0, { sql: failure.column, binary: true })
  return {
    kind: 'select',
    columns,
    rows: chance(rng, 0.1) ? 0 : chance(rng, 0.1) ? int(rng, 200, 1500) : int(rng, 1, 30),
    where: chance(rng, 0.2) ? ' WHERE g % 2 = 1' : '',
    order: chance(rng, 0.2) ? ' ORDER BY g DESC' : '',
    text: failure && failure.text,
  }
}

// the reset of a round sends ROLLBACK whether a transaction is open or not, and the warning it
// gets otherwise would go to stderr through libpq; nothing here compares notices
const QUIET = 'SET client_min_messages = error'
// the writes go to a temp table every arm creates on its own connection
const SETUP = 'CREATE TEMP TABLE fuzz_rows (id serial PRIMARY KEY, n int4, t text, j jsonb)'
const drawWrite = (rng) => {
  const n = int(rng, 0, 20)
  const write = pick(rng, [
    { text: `INSERT INTO fuzz_rows (n, t) SELECT g, 'v' || g FROM generate_series(1, ${n}) g` },
    {
      text: `INSERT INTO fuzz_rows (n, t, j) VALUES ($1, $2, $3) RETURNING *`,
      values: [ints(rng, 32), texts(rng), { k: n }],
    },
    { text: `INSERT INTO fuzz_rows (n) SELECT g FROM generate_series(1, ${n}) g RETURNING id, n` },
    { text: `UPDATE fuzz_rows SET n = n + $1 WHERE n > $2`, values: [1, int(rng, -5, 5)] },
    { text: `UPDATE fuzz_rows SET t = upper(t) WHERE id % 3 = 0 RETURNING id, t` },
    { text: `DELETE FROM fuzz_rows WHERE n < $1`, values: [int(rng, 0, 10)] },
    { text: `DELETE FROM fuzz_rows WHERE id % 2 = 0 RETURNING id` },
    { text: `SELECT count(*)::int AS c, sum(n)::int AS s, array_agg(t ORDER BY id) AS ts FROM fuzz_rows` },
    { text: 'BEGIN' },
    { text: 'COMMIT' },
    { text: 'ROLLBACK' },
    { text: pick(rng, ['', ' ', ';', '-- nothing']) },
    // a duplicate key once a row with id 1 exists
    { text: `INSERT INTO fuzz_rows (id) VALUES (1)` },
  ])
  return { kind: 'write', text: write.text, values: write.values || [], binary: false }
}

// `buffers: false` leaves Buffer parameters out, see the bytea entry above
const draw = (rng, { buffers = true } = {}) => ({
  queries: Array.from({ length: int(rng, 1, 6) }, () =>
    chance(rng, 0.7) ? drawSelect(rng, { buffers }) : drawWrite(rng)
  ),
})

// the text and values of a query, numbering the parameters in the order the columns have now,
// which is what lets shrinking drop a column without leaving a gap in the $n
const render = (query) => {
  if (query.kind === 'write') return { kind: 'write', text: query.text, values: query.values, binary: false }
  const values = []
  const names = query.columns.map((c, i) => {
    if ('param' in c) {
      values.push(c.param)
      return `$${values.length}${c.sql} AS c${i}`
    }
    return `${c.sql} AS c${i}`
  })
  return {
    kind: 'select',
    text:
      query.text ||
      `SELECT ${names.join(', ')} FROM generate_series(1, ${query.rows}) AS g${query.where}${query.order}`,
    values,
    binary: !query.text && query.columns.every((c) => c.binary),
  }
}

// one text for a result, or for an error, so arms compare by string equality. Fields keep only
// what every arm reports the same way, the format is the arm's own choice
const summarize = (result, error) => {
  if (error) {
    return canon({
      error: error.code,
      message: error.message,
      position: error.position,
      severity: error.severity,
      detail: error.detail,
      hint: error.hint,
    })
  }
  return canon({
    command: result.command,
    rowCount: result.rowCount,
    fields: (result.fields || []).map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    rows: result.rows,
  })
}

const rowsOnly = (result, error) => (error ? summarize(result, error) : canon({ rows: result.rows }))

const source = (plan) =>
  plan.queries
    .map((q) => {
      const { text, values } = render(q)
      return `await client.query(${JSON.stringify(text)}${values.length ? `, ${canon(values)}` : ''})`
    })
    .join('\n')

// a smaller plan for each query that can be dropped, then for each column of a select
const variants = (plan) => {
  const out = []
  for (let i = 0; i < plan.queries.length; i++) out.push({ queries: plan.queries.filter((_, k) => k !== i) })
  plan.queries.forEach((q, i) => {
    if (q.kind !== 'select' || q.columns.length < 2) return
    for (let k = 0; k < q.columns.length; k++) {
      const smaller = { ...q, columns: q.columns.filter((_, j) => j !== k) }
      out.push({ queries: plan.queries.map((other, j) => (j === i ? smaller : other)) })
    }
  })
  return out
}

module.exports = { draw, render, summarize, rowsOnly, source, variants, SETUP, QUIET }

const helper = require('../test-helper')
const assert = require('assert')

const suite = new helper.Suite()

suite.testAsync('binary format mode parses integers correctly', async () => {
  const client = new helper.pg.Client()
  await client.connect()

  const r1 = await client.query({
    text: 'SELECT 1::int as a, 1000::int as b, $1::int as c',
    values: [3000],
    binary: false,
  })
  assert.deepEqual([1, 1000, 3000], [r1.rows[0].a, r1.rows[0].b, r1.rows[0].c])

  const r2 = await client.query({
    text: 'SELECT 1::int as a, 1000::int as b, $1::int as c',
    values: [3000],
    binary: true,
  })
  assert.deepEqual([1, 1000, 3000], [r2.rows[0].a, r2.rows[0].b, r2.rows[0].c])

  await client.end()
})

const query = `SELECT 
  -- Numeric types
  1::smallint as smallint_val,
  1000::int as int_val,
  1000000::bigint as bigint_val,
  3.14::real as real_val,
  3.141592653589793::double precision as double_val,
  123.45::numeric as numeric_val,
  123.456789::decimal(10,6) as decimal_val,
  
  -- Character types
  'hello'::text as text_val,
  'world'::varchar(50) as varchar_val,
  'test'::char(10) as char_val,
  'café'::text as unicode_val,
  
  -- Boolean
  true::boolean as true_val,
  false::boolean as false_val,
  
  -- Date/time types
  '2023-12-25'::date as date_val,
  '14:30:00'::time as time_val,
  '14:30:00+05:00'::timetz as timetz_val,
  '2023-12-25 14:30:00'::timestamp as timestamp_val,
  '2023-12-25 14:30:00+00:00'::timestamptz as timestamptz_val,
  '1 year 2 months 3 days'::interval as interval_val,
  
  -- UUID
  '550e8400-e29b-41d4-a716-446655440000'::uuid as uuid_val,
  
  -- Binary data
  '\\x48656c6c6f'::bytea as bytea_val,
  
  -- JSON types
  '{"name": "John", "age": 30}'::json as json_val,
  '{"name": "Jane", "age": 25}'::jsonb as jsonb_val,
  
  -- Arrays
  ARRAY[1,2,3]::int[] as int_array,
  ARRAY['a','b','c']::text[] as text_array,
  ARRAY[true,false,true]::boolean[] as bool_array,
  ARRAY[1.1,2.2,3.3]::real[] as real_array,
  ARRAY[10,20,30]::bigint[] as bigint_array,
  ARRAY[[1,2],[3,4]]::int[][] as multi_int_array,
  ARRAY[1,NULL,3]::int[] as int_array_with_nulls,
  
  -- Network address types
  '192.168.1.1'::inet as inet_val,
  '192.168.1.0/24'::cidr as cidr_val,
  '08:00:2b:01:02:03'::macaddr as macaddr_val,
  
  -- Geometric types
  '(1,2)'::point as point_val,
  '((0,0),(1,1))'::box as box_val,
  '<(0,0),1>'::circle as circle_val,
  '(0,0),(1,1)'::lseg as lseg_val,
  '((0,0),(1,0),(1,1),(0,1))'::polygon as polygon_val,
  '[(0,0),(1,1)]'::path as path_val,
  
  -- Range types
  '[1,10)'::int4range as int_range,
  '[2023-01-01,2023-12-31]'::daterange as date_range,
  '(1.5,3.5]'::numrange as num_range,
  
  -- NULL values
  NULL::int as null_int,
  NULL::text as null_text,
  NULL::int[] as null_array,
  
  -- Edge cases
  0::int as zero_int,
  (-2147483647-1)::int as min_int,
  2147483647::int as max_int,
  ''::text as empty_text,
  ARRAY[]::int[] as empty_array
`
;['text', 'binary'].forEach((format) => {
  suite.testAsync(`${format} format mode parses all types correctly`, async () => {
    const client = new helper.pg.Client()
    await client.connect()

    const result = await client.query({
      text: query,
      binary: format === 'binary',
    })

    const offsetResult = await client.query(
      "SELECT EXTRACT(timezone_hour FROM '2023-12-25'::timestamptz)::integer as offset_hours"
    )
    const offsetHours = offsetResult.rows[0].offset_hours

    const row = result.rows[0]

    // Numeric types
    assert.strictEqual(row.smallint_val, 1)
    assert.strictEqual(row.int_val, 1000)
    assert.strictEqual(row.bigint_val, '1000000')
    assert.strictEqual(parseFloat(row.real_val.toFixed(2)), 3.14)
    assert.strictEqual(row.double_val, 3.141592653589793)
    assert.strictEqual(row.numeric_val, '123.45')
    assert.strictEqual(row.decimal_val, '123.456789')

    // Character types
    assert.strictEqual(row.text_val, 'hello')
    assert.strictEqual(row.varchar_val, 'world')
    assert.strictEqual(row.char_val, 'test      ') // padded with spaces
    assert.strictEqual(row.unicode_val, 'café')

    // Boolean
    assert.strictEqual(row.true_val, true)
    assert.strictEqual(row.false_val, false)

    // Date/time types - both should be Date objects
    assert.strictEqual(row.date_val.getUTCFullYear(), 2023)
    assert.strictEqual(row.date_val.getUTCMonth(), 11) // December
    assert.strictEqual(row.date_val.getUTCDate(), 25)
    assert.strictEqual(row.time_val, '14:30:00')
    assert.strictEqual(row.timetz_val, '14:30:00+05')
    assert.strictEqual(row.timestamp_val.getUTCFullYear(), 2023)
    assert.strictEqual(row.timestamp_val.getUTCMonth(), 11)
    assert.strictEqual(row.timestamp_val.getUTCDate(), 25)
    assert.strictEqual(row.timestamp_val.getUTCHours() + offsetHours, 14)
    assert.strictEqual(row.timestamp_val.getUTCMinutes(), 30)
    assert.strictEqual(row.timestamptz_val.getTime(), 1703514600000)
    assert.deepEqual(row.interval_val, { years: 1, months: 2, days: 3 })

    // UUID
    assert.strictEqual(row.uuid_val, '550e8400-e29b-41d4-a716-446655440000')

    // Binary data
    assert(Buffer.isBuffer(row.bytea_val))
    assert.strictEqual(row.bytea_val.toString(), 'Hello')

    // JSON types
    assert.deepEqual(row.json_val, { name: 'John', age: 30 })
    assert.deepEqual(row.jsonb_val, { name: 'Jane', age: 25 })

    // Arrays
    assert.deepEqual(row.int_array, [1, 2, 3])
    assert.deepEqual(row.text_array, ['a', 'b', 'c'])
    assert.deepEqual(row.bool_array, [true, false, true])
    assert.deepEqual(row.real_array, [1.1, 2.2, 3.3])
    assert.deepEqual(row.bigint_array, [10, 20, 30])
    assert.deepEqual(row.multi_int_array, [
      [1, 2],
      [3, 4],
    ])
    assert.deepEqual(row.int_array_with_nulls, [1, null, 3])

    // Network address types
    assert.strictEqual(row.inet_val, '192.168.1.1')
    assert.strictEqual(row.cidr_val, '192.168.1.0/24')
    assert.strictEqual(row.macaddr_val, '08:00:2b:01:02:03')

    // Geometric types
    assert.deepEqual(row.point_val, { x: 1, y: 2 })
    assert.deepEqual(row.box_val, '(1,1),(0,0)')
    assert.deepEqual(row.circle_val, { x: 0, y: 0, radius: 1 })
    assert.deepEqual(row.lseg_val, '[(0,0),(1,1)]')
    assert.deepEqual(row.polygon_val, '((0,0),(1,0),(1,1),(0,1))')
    assert.deepEqual(row.path_val, '[(0,0),(1,1)]')

    // Range types
    assert.deepEqual(row.int_range, '[1,10)')
    assert.deepEqual(row.date_range, '[2023-01-01,2024-01-01)')
    assert.deepEqual(row.num_range, '(1.5,3.5]')

    // NULL values
    assert.strictEqual(row.null_int, null)
    assert.strictEqual(row.null_text, null)
    assert.strictEqual(row.null_array, null)

    // Edge cases
    assert.strictEqual(row.zero_int, 0)
    assert.strictEqual(row.min_int, -2147483648)
    assert.strictEqual(row.max_int, 2147483647)
    assert.strictEqual(row.empty_text, '')
    assert.deepEqual(row.empty_array, [])

    await client.end()
  })
})

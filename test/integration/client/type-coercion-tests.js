'use strict'
var helper = require(__dirname + '/test-helper')
var pg = helper.pg
var sink
const suite = new helper.Suite()

var testForTypeCoercion = function (type) {
  const pool = new pg.Pool()
  suite.test(`test type coercion ${type.name}`, (cb) => {
    pool.connect(function (err, client, done) {
      assert(!err)
      client.query('create temp table test_type(col ' + type.name + ')', assert.calls(function (err, result) {
        assert(!err)

        type.values.forEach(function (val) {
          var insertQuery = client.query('insert into test_type(col) VALUES($1)', [val], assert.calls(function (err, result) {
            assert(!err)
          }))

          var query = client.query(new pg.Query({
            name: 'get type ' + type.name,
            text: 'select col from test_type'
          }))

          query.on('error', function (err) {
            console.log(err)
            throw err
          })

          assert.emits(query, 'row', function (row) {
            var expected = val + ' (' + typeof val + ')'
            var returned = row.col + ' (' + typeof row.col + ')'
            assert.strictEqual(row.col, val, 'expected ' + type.name + ' of ' + expected + ' but got ' + returned)
          }, 'row should have been called for ' + type.name + ' of ' + val)

          client.query('delete from test_type')
        })

        client.query('drop table test_type', function () {
          done()
          pool.end(cb)
        })
      }))
    })
  })
}

var types = [{
  name: 'integer',
  values: [-2147483648, -1, 0, 1, 2147483647, null]
}, {
  name: 'smallint',
  values: [-32768, -1, 0, 1, 32767, null]
}, {
  name: 'bigint',
  values: [
    '-9223372036854775808',
    '-9007199254740992',
    '0',
    '9007199254740992',
    '72057594037928030',
    '9223372036854775807',
    null
  ]
}, {
  name: 'varchar(5)',
  values: ['yo', '', 'zomg!', null]
}, {
  name: 'oid',
  values: [0, 204410, null]
}, {
  name: 'bool',
  values: [true, false, null]
}, {
  name: 'numeric',
  values: [
    '-12.34',
    '0',
    '12.34',
    '-3141592653589793238462643383279502.1618033988749894848204586834365638',
    '3141592653589793238462643383279502.1618033988749894848204586834365638',
    null
  ]
}, {
  name: 'real',
  values: [-101.3, -1.2, 0, 1.2, 101.1, null]
}, {
  name: 'double precision',
  values: [-101.3, -1.2, 0, 1.2, 101.1, null]
}, {
  name: 'timestamptz',
  values: [null]
}, {
  name: 'timestamp',
  values: [null]
}, {
  name: 'timetz',
  values: ['13:11:12.1234-05:30', null]
}, {
  name: 'time',
  values: ['13:12:12.321', null]
}]

// ignore some tests in binary mode
if (helper.config.binary) {
  types = types.filter(function (type) {
    return !(type.name in { 'real': 1, 'timetz': 1, 'time': 1, 'numeric': 1, 'bigint': 1 })
  })
}

var valueCount = 0

types.forEach(function (type) {
  testForTypeCoercion(type)
})

suite.test('timestampz round trip', function (cb) {
  var now = new Date()
  var client = helper.client()
  client.query('create temp table date_tests(name varchar(10), tstz timestamptz(3))')
  client.query({
    text: 'insert into date_tests(name, tstz)VALUES($1, $2)',
    name: 'add date',
    values: ['now', now]
  })
  var result = client.query(new pg.Query({
    name: 'get date',
    text: 'select * from date_tests where name = $1',
    values: ['now']
  }))

  assert.emits(result, 'row', function (row) {
    var date = row.tstz
    assert.equal(date.getYear(), now.getYear())
    assert.equal(date.getMonth(), now.getMonth())
    assert.equal(date.getDate(), now.getDate())
    assert.equal(date.getHours(), now.getHours())
    assert.equal(date.getMinutes(), now.getMinutes())
    assert.equal(date.getSeconds(), now.getSeconds())
    assert.equal(date.getMilliseconds(), now.getMilliseconds())
  })

  client.on('drain', () => {
    client.end(cb)
  })
})

suite.test('selecting nulls', cb => {
  const pool = new pg.Pool()
  pool.connect(assert.calls(function (err, client, done) {
    assert.ifError(err)
    client.query('select null as res;', assert.calls(function (err, res) {
      assert(!err)
      assert.strictEqual(res.rows[0].res, null)
    }))
    client.query('select 7 <> $1 as res;', [null], function (err, res) {
      assert(!err)
      assert.strictEqual(res.rows[0].res, null)
      done()
      pool.end(cb)
    })
  }))
})

suite.test('date range extremes', function (done) {
  var client = helper.client()

  // Set the server timeszone to the same as used for the test,
  // otherwise (if server's timezone is ahead of GMT) in
  // textParsers.js::parseDate() the timezone offest is added to the date;
  // in the case of "275760-09-13 00:00:00 GMT" the timevalue overflows.
  client.query('SET TIMEZONE TO GMT', assert.success(function (res) {
    // PostgreSQL supports date range of 4713 BCE to 294276 CE
    //   http://www.postgresql.org/docs/9.2/static/datatype-datetime.html
    // ECMAScript supports date range of Apr 20 271821 BCE to Sep 13 275760 CE
    //   http://ecma-international.org/ecma-262/5.1/#sec-15.9.1.1
    client.query('SELECT $1::TIMESTAMPTZ as when', ['275760-09-13 00:00:00 GMT'], assert.success(function (res) {
      assert.equal(res.rows[0].when.getFullYear(), 275760)
    }))

    client.query('SELECT $1::TIMESTAMPTZ as when', ['4713-12-31 12:31:59 BC GMT'], assert.success(function (res) {
      assert.equal(res.rows[0].when.getFullYear(), -4713)
    }))

    client.query('SELECT $1::TIMESTAMPTZ as when', ['275760-09-13 00:00:00 -15:00'], assert.success(function (res) {
      assert(isNaN(res.rows[0].when.getTime()))
    }))

    client.on('drain', () => {
      client.end(done)
    })
  }))
})

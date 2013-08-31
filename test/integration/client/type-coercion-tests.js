var helper = require(__dirname + '/test-helper');
var sink;

var testForTypeCoercion = function(type){
  helper.pg.connect(helper.config, function(err, client, done) {
    assert.isNull(err);
    client.query("create temp table test_type(col " + type.name + ")", assert.calls(function(err, result) {
      assert.isNull(err);
      test("Coerces " + type.name, function() {
        type.values.forEach(function(val) {

          var insertQuery = client.query('insert into test_type(col) VALUES($1)',[val],assert.calls(function(err, result) {
            assert.isNull(err);
          }));

          var query = client.query({
            name: 'get type ' + type.name ,
            text: 'select col from test_type'
          });
          query.on('error', function(err) {
            console.log(err);
            throw err;
          });

          assert.emits(query, 'row', function(row) {
            var expected = val + " (" + typeof val + ")";
            var returned = row.col + " (" + typeof row.col + ")";
            assert.strictEqual(row.col, val, "expected " + type.name + " of " + expected + " but got " + returned);
          }, "row should have been called for " + type.name + " of " + val);

          client.query('delete from test_type');
        });

        client.query('drop table test_type', function() {
          sink.add();
          done();
        });
      })
    }));
  })
};

var types = [{
  name: 'integer',
  values: [-2147483648, -1, 0, 1, 2147483647, null]
},{
  name: 'smallint',
  values: [-32768, -1, 0, 1, 32767, null]
},{
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
},{
  name: 'varchar(5)',
  values: ['yo', '', 'zomg!', null]
},{
  name: 'oid',
  values: [0, 204410, null]
},{
  name: 'bool',
  values: [true, false, null]
},{
  name: 'numeric',
  values: [
    '-12.34',
    '0',
    '12.34',
    '-3141592653589793238462643383279502.1618033988749894848204586834365638',
    '3141592653589793238462643383279502.1618033988749894848204586834365638',
    null
  ]
},{
  name: 'real',
  values: [-101.3, -1.2, 0, 1.2, 101.1, null]
},{
  name: 'double precision',
  values: [-101.3, -1.2, 0, 1.2, 101.1, null]
},{
  name: 'timestamptz',
  values: [null]
},{
  name: 'timestamp',
  values: [null]
},{
  name: 'timetz',
  values: ['13:11:12.1234-05:30',null]
},{
  name: 'time',
  values: ['13:12:12.321', null]
}];

// ignore some tests in binary mode
if (helper.config.binary) {
  types = types.filter(function(type) {
    return !(type.name in {'real': 1, 'timetz':1, 'time':1, 'numeric': 1, 'bigint': 1});
  });
}

var valueCount = 0;
types.forEach(function(type) {
  valueCount += type.values.length;
})
sink = new helper.Sink(types.length + 1, function() {
  helper.pg.end();
})

types.forEach(function(type) {
  testForTypeCoercion(type)
});

test("timestampz round trip", function() {
  var now = new Date();
  var client = helper.client();
  client.on('error', function(err) {
    console.log(err);
    client.end();
  });
  client.query("create temp table date_tests(name varchar(10), tstz timestamptz(3))");
  client.query({
    text: "insert into date_tests(name, tstz)VALUES($1, $2)",
    name: 'add date',
    values: ['now', now]
  });
  var result = client.query({
    name: 'get date',
    text: 'select * from date_tests where name = $1',
    values: ['now']
  });

  assert.emits(result, 'row', function(row) {
    var date = row.tstz;
    assert.equal(date.getYear(),now.getYear());
    assert.equal(date.getMonth(), now.getMonth());
    assert.equal(date.getDate(), now.getDate());
    assert.equal(date.getHours(), now.getHours());
    assert.equal(date.getMinutes(), now.getMinutes());
    assert.equal(date.getSeconds(), now.getSeconds());
    test("milliseconds are equal", function() {
      assert.equal(date.getMilliseconds(), now.getMilliseconds());
    });
  });

  client.on('drain', client.end.bind(client));
});

helper.pg.connect(helper.config, assert.calls(function(err, client, done) {
  assert.isNull(err);
  client.query('select null as res;', assert.calls(function(err, res) {
    assert.isNull(err);
    assert.strictEqual(res.rows[0].res, null)
  }))
  client.query('select 7 <> $1 as res;',[null], function(err, res) {
    assert.isNull(err);
    assert.strictEqual(res.rows[0].res, null);
    sink.add();
    done();
  })
}))

if(!helper.config.binary) {
  test("postgres date type", function() {
    var client = helper.client();
    client.on('error', function(err) {
      console.log(err);
      client.end();
    });
    client.query("SELECT '2010-10-31'::date", assert.calls(function(err, result){
      assert.isNull(err);
      assert.UTCDate(result.rows[0].date, 2010, 9, 31, 0, 0, 0, 0);
    }));
    client.on('drain', client.end.bind(client));
  });
}

var helper = require(__dirname + '/test-helper');
//http://www.postgresql.org/docs/8.4/static/datatype.html
test('typed results', function() {
  var client = helper.client();
  var con = client.connection;
  con.emit('readyForQuery');
  var query = client.query("the bums lost");


  //TODO refactor to this style
  var tests = [{
    name: 'string/varchar',
    dataTypeID: 1043,
    actual: 'bang',
    expected: 'bang'
  },{
    name: 'integer/int4',
    dataTypeID: 23,
    actual: '100',
    expected: 100
  },{
    name: 'smallint/int2',
    dataTypeID: 21,
    actual: '101',
    expected: 101
  },{
    name: 'bigint/int8',
    dataTypeID: 20,
    actual: '102',
    expected: 102
  },{
    name: 'oid',
    dataTypeID: 26,
    actual: '103',
    expected: 103
  },{
    name: 'numeric',
    dataTypeID: 1700,
    actual: '12.34',
    expected: 12.34
  },{
    name: 'real/float4',
    dataTypeID: 700,
    actual: '123.456',
    expected: 123.456
  },{
    name: 'double precision / float8',
    dataTypeID: 701,
    actual: '1.2',
    expected: 1.2
  },{
    name: 'boolean true',
    dataTypeID: 16,
    actual: 't',
    expected: true
  },{
    name: 'boolean false',
    dataTypeID: 16,
    actual: 'f',
    expected: false
  },{
    name: 'boolean null',
    dataTypeID: 16,
    actual: null,
    expected: null
  },{
    name: 'timestamptz with minutes in timezone',
    dataTypeID: 1184,
    actual: '2010-10-31 14:54:13.74-0530',
    expected: function(val) {
      assert.UTCDate(val, 2010, 9, 31, 20, 24, 13, 740);
    }
  },{
    name: 'timestamptz with other milisecond digits dropped',
    dataTypeID: 1184,
    actual: '2011-01-23 22:05:00.68-06',
    expected: function(val) {
      assert.UTCDate(val, 2011, 0, 24, 4, 5, 00, 680);
    }
  }, {
    name: 'timestampz with huge miliseconds in UTC',
    dataTypeID: 1184,
    actual: '2010-10-30 14:11:12.730838Z',
    expected: function(val) {
      assert.UTCDate(val, 2010, 9, 30, 14, 11, 12, 730);
    }
  },{
    name: 'timestampz with no miliseconds',
    dataTypeID: 1184,
    actual: '2010-10-30 13:10:01+05',
    expected: function(val) {
      assert.UTCDate(val, 2010, 9, 30, 8, 10, 01, 0);
    }
  },{
    name: 'timestamp',
    dataTypeID: 1114,
    actual:  '2010-10-31 00:00:00',
    expected: function(val) {
      assert.UTCDate(val, 2010, 9, 31, 0, 0, 0, 0);
    }
  },{
    name: 'interval time',
    dataTypeID: 1186,
    actual: '01:02:03',
    expected: function(val) {
      assert.deepEqual(val, {'hours':1, 'minutes':2, 'seconds':3})
    }
  },{
    name: 'interval long',
    dataTypeID: 1186,
    actual: '1 year -32 days',
    expected: function(val) {
      assert.deepEqual(val, {'years':1, 'days':-32})
    }
  },{
    name: 'interval combined negative',
    dataTypeID: 1186,
    actual: '1 day -00:00:03',
    expected: function(val) {
      assert.deepEqual(val, {'days':1, 'seconds':-3})
    }
  },{
    name: 'bytea',
    dataTypeID: 17,
    actual: 'foo\\000\\200\\\\\\377',
    expected: function(val) {
      assert.deepEqual(val, new Buffer([102, 111, 111, 0, 128, 92, 255]));
    }
  },{
    name: 'empty bytea',
    dataTypeID: 17,
    actual: '',
    expected: function(val) {
      assert.deepEqual(val, new Buffer(0));
    }
  }];


  con.emit('rowDescription', {
    fieldCount: tests.length,
    fields: tests
  });

  assert.emits(query, 'row', function(row) {
    for(var i = 0; i < tests.length; i++) {
      test('parses ' + tests[i].name, function() {
        var expected = tests[i].expected;
        if(typeof expected === 'function') {
          return expected(row[tests[i].name]);
        }
        assert.strictEqual(row[tests[i].name], expected);
      });
    }
  });

  assert.ok(con.emit('dataRow', {
    fields: tests.map(function(x) {
      return x.actual;
    })
  }));

});

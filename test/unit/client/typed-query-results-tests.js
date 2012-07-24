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
    format: 'text',
    dataTypeID: 1043,
    actual: 'bang',
    expected: 'bang'
  },{
    name: 'integer/int4',
    format: 'text',
    dataTypeID: 23,
    actual: '100',
    expected: 100
  },{
    name: 'smallint/int2',
    format: 'text',
    dataTypeID: 21,
    actual: '101',
    expected: 101
  },{
    name: 'bigint/int8',
    format: 'text',
    dataTypeID: 20,
    actual: '102',
    expected: 102
  },{
    name: 'oid',
    format: 'text',
    dataTypeID: 26,
    actual: '103',
    expected: 103
  },{
    name: 'numeric',
    format: 'text',
    dataTypeID: 1700,
    actual: '12.34',
    expected: 12.34
  },{
    name: 'real/float4',
    dataTypeID: 700,
    format: 'text',
    actual: '123.456',
    expected: 123.456
  },{
    name: 'double precision / float8',
    format: 'text',
    dataTypeID: 701,
    actual: '1.2',
    expected: 1.2
  },{
    name: 'boolean true',
    format: 'text',
    dataTypeID: 16,
    actual: 't',
    expected: true
  },{
    name: 'boolean false',
    format: 'text',
    dataTypeID: 16,
    actual: 'f',
    expected: false
  },{
    name: 'boolean null',
    format: 'text',
    dataTypeID: 16,
    actual: null,
    expected: null
  },{
    name: 'timestamptz with minutes in timezone',
    format: 'text',
    dataTypeID: 1184,
    actual: '2010-10-31 14:54:13.74-0530',
    expected: function(val) {
      assert.UTCDate(val, 2010, 9, 31, 20, 24, 13, 740);
    }
  },{
    name: 'timestamptz with other milisecond digits dropped',
    format: 'text',
    dataTypeID: 1184,
    actual: '2011-01-23 22:05:00.68-06',
    expected: function(val) {
      assert.UTCDate(val, 2011, 0, 24, 4, 5, 00, 680);
    }
  }, {
    name: 'timestampz with huge miliseconds in UTC',
    format: 'text',
    dataTypeID: 1184,
    actual: '2010-10-30 14:11:12.730838Z',
    expected: function(val) {
      assert.UTCDate(val, 2010, 9, 30, 14, 11, 12, 730);
    }
  },{
    name: 'timestampz with no miliseconds',
    format: 'text',
    dataTypeID: 1184,
    actual: '2010-10-30 13:10:01+05',
    expected: function(val) {
      assert.UTCDate(val, 2010, 9, 30, 8, 10, 01, 0);
    }
  },{
    name: 'timestamp',
    format: 'text',
    dataTypeID: 1114,
    actual:  '2010-10-31 00:00:00',
    expected: function(val) {
      assert.UTCDate(val, 2010, 9, 31, 0, 0, 0, 0);
    }
  },{
    name: 'date',
    format: 'text',
    dataTypeID: 1082,
    actual: '2010-10-31',
    expected: function(val) {
      assert.UTCDate(val, 2010, 9, 31, 0, 0, 0, 0);
    }
  },{
    name: 'interval time',
    format: 'text',
    dataTypeID: 1186,
    actual: '01:02:03',
    expected: function(val) {
      assert.deepEqual(val, {'hours':1, 'minutes':2, 'seconds':3})
    }
  },{
    name: 'interval long',
    format: 'text',
    dataTypeID: 1186,
    actual: '1 year -32 days',
    expected: function(val) {
      assert.deepEqual(val, {'years':1, 'days':-32})
    }
  },{
    name: 'interval combined negative',
    format: 'text',
    dataTypeID: 1186,
    actual: '1 day -00:00:03',
    expected: function(val) {
      assert.deepEqual(val, {'days':1, 'seconds':-3})
    }
  },{
    name: 'bytea',
    format: 'text',
    dataTypeID: 17,
    actual: 'foo\\000\\200\\\\\\377',
    expected: function(val) {
      assert.deepEqual(val, new Buffer([102, 111, 111, 0, 128, 92, 255]));
    }
  },{
    name: 'empty bytea',
    format: 'text',
    dataTypeID: 17,
    actual: '',
    expected: function(val) {
      assert.deepEqual(val, new Buffer(0));
    }
  },


  {
    name: 'binary-string/varchar',
    format: 'binary',
    dataTypeID: 1043,
    actual: 'bang',
    expected: 'bang'
  },{
    name: 'binary-integer/int4',
    format: 'binary',
    dataTypeID: 23,
    actual: [0, 0, 0, 100],
    expected: 100
  },{
    name: 'binary-smallint/int2',
    format: 'binary',
    dataTypeID: 21,
    actual: [0, 101],
    expected: 101
  },{
    name: 'binary-bigint/int8',
    format: 'binary',
    dataTypeID: 20,
    actual: [0, 0, 0, 0, 0, 0, 0, 102],
    expected: 102
  },{
    name: 'binary-bigint/int8-full',
    format: 'binary',
    dataTypeID: 20,
    actual: [1, 0, 0, 0, 0, 0, 0, 102],
    expected: 72057594037928030
  },{
    name: 'binary-oid',
    format: 'binary',
    dataTypeID: 26,
    actual: [0, 0, 0, 103],
    expected: 103
  },{
    name: 'binary-numeric',
    format: 'binary',
    dataTypeID: 1700,
    actual: [0,2,0,0,0,0,0,0x64,0,12,0xd,0x48,0,0,0,0],
    expected: 12.34
  },{
    name: 'binary-real/float4',
    dataTypeID: 700,
    format: 'binary',
    actual: [0x41, 0x48, 0x00, 0x00],
    expected: 12.5
  },{
    name: 'binary-double precision / float8',
    format: 'binary',
    dataTypeID: 701,
    actual: [0x3F,0xF3,0x33,0x33,0x33,0x33,0x33,0x33],
    expected: 1.2
  },{
    name: 'binary-boolean true',
    format: 'binary',
    dataTypeID: 16,
    actual: [1],
    expected: true
  },{
    name: 'binary-boolean false',
    format: 'binary',
    dataTypeID: 16,
    actual: [0],
    expected: false
  },{
    name: 'binary-boolean null',
    format: 'binary',
    dataTypeID: 16,
    actual: null,
    expected: null
  },{
    name: 'binary-timestamp',
    format: 'binary',
    dataTypeID: 1184,
    actual: [0x00, 0x01, 0x36, 0xee, 0x3e, 0x66, 0x9f, 0xe0],
    expected: function(val) {
      assert.UTCDate(val, 2010, 9, 31, 20, 24, 13, 740);
    }
  },{
    name: 'binary-string',
    format: 'binary',
    dataTypeID: 25,
    actual: new Buffer([0x73, 0x6c, 0x61, 0x64, 0x64, 0x61]),
    expected: 'sladda'
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

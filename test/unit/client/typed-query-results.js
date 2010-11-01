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
      assert.UTCDate(val, 2010, 9, 31, 9, 24, 13, 74);
    }
  },{
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
      assert.UTCDate(val, 2010, 9, 30, 18, 10, 01, 0);
    }
  },{
    name: 'timestamp',
    dataTypeID: 1114,
    actual:  '2010-10-31 00:00:00',
    expected: function(val) {
      assert.UTCDate(val, 2010, 9, 31, 0, 0, 0, 0);
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
          return expected(row.fields[i]);
        }
        assert.strictEqual(row.fields[i], expected);

      });
    }
  });

  assert.ok(con.emit('dataRow', {
    fields: tests.map(function(x) {
      return x.actual;
    })
  }));

});

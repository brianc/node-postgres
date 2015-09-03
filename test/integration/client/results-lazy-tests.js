var util = require('util');
var helper = require('./test-helper');

var Client = helper.Client;

var conInfo = helper.config;

test('returns results as lazy parsing object', function() {
  var client = new Client(conInfo);
  var checkRow = function(row) {
    if (helper.config.binary) {
      assert.strictEqual(Object.getPrototypeOf(row['value1']), Buffer.prototype);
      assert.strictEqual(Object.getPrototypeOf(row['value2']), Buffer.prototype);
      assert.strictEqual(Object.getPrototypeOf(row['value3']), Buffer.prototype);
      assert.strictEqual(row['value4'], null);
    } else {
      assert.strictEqual(typeof row['value1'], 'string');
      assert.strictEqual(row['value2'], '1');
      assert.strictEqual(row['value3'], 'hai');
      assert.strictEqual(row['value4'], null);
    }
    assert.equal(row.parse_value1().getFullYear(), new Date().getFullYear());
    assert.strictEqual(row.parse_value2(), 1);
    assert.strictEqual(row.parse_value3(), 'hai');
    assert.strictEqual(row.parse_value4(), null);
  }
  client.connect(assert.success(function() {
    var config = {
      text: 'SELECT NOW() as value1, 1::int as value2, $1::text as value3, null as value4',
      values: ['hai'],
      rowMode: 'lazy'
    };
    var query = client.query(config, assert.success(function(result) {
      assert.equal(result.rows.length, 1);
      checkRow(result.rows[0]);
      client.end();
    }));
    assert.emits(query, 'row', function(row) {
      checkRow(row);
    });
  }));
});

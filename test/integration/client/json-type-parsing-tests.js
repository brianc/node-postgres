var helper = require(__dirname + '/test-helper');
var assert = require('assert');
//if you want binary support, pull request me!
if (helper.config.binary) {
  console.log('binary mode does not support JSON right now');
  return;
}

test('can read and write json', function() {
  helper.pg.connect(helper.config, function(err, client, done) {
    assert.ifError(err);
    var currentId = -1;
    helper.versionGTE(client, '9.2.0', assert.success(function(jsonSupported) {
      if(!jsonSupported) {
        console.log('skip json test on older versions of postgres');
        done();
        return helper.pg.end();
      }
      client.query('CREATE TEMP TABLE stuff(id SERIAL PRIMARY KEY, data JSON)');
      var value ={name: 'Brian', age: 250, alive: true, now: new Date()};
      testJsonValue({name: 'Brian', age: 250, alive: true, now: new Date()}, function() {
        var arr =[value];
        Object.defineProperty(arr, 'isJSON', {enumerable: false});
        testJsonValue(arr, function() {
          done();
          helper.pg.end();
        });
      });
    }));
    function testJsonValue(value, cb) {
      client.query('INSERT INTO stuff (data) VALUES ($1)', [value]);
      currentId++;
      client.query('SELECT * FROM stuff', assert.success(function(result) {
        assert.equal(result.rows.length, currentId+1);
        assert.equal(typeof result.rows[0].data, 'object');
        var row = result.rows[currentId].data;
        if (Array.isArray(value)) {
          assert.strictEqual(row.length, 1);
          row = row[0];
          value = value[0];
        }
        assert.strictEqual(row.name, value.name);
        assert.strictEqual(row.age, value.age);
        assert.strictEqual(row.alive, value.alive);
        test('row should have "now" as a date', function() {
          return false;
          assert(row.now instanceof Date, 'row.now should be a date instance but is ' + typeof row.now);
        });
        assert.equal(JSON.stringify(row.now), JSON.stringify(value.now));
        cb();
      }));
    }
  });
});

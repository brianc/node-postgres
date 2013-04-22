var helper = require(__dirname + '/test-helper');
var assert = require('assert');
//if you want binary support, pull request me!
if (helper.config.binary) {
  return;
}

test('can read and write json', function() {
  helper.pg.connect(helper.config, function(err, client, done) {
    assert.ifError(err);
    client.query('CREATE TEMP TABLE stuff(id SERIAL PRIMARY KEY, data JSON)');
    var value ={name: 'Brian', age: 250, alive: true, now: new Date()};
    client.query('INSERT INTO stuff (data) VALUES ($1)', [value]);
    client.query('SELECT * FROM stuff', assert.success(function(result) {
      assert.equal(result.rows.length, 1);
      assert.equal(typeof result.rows[0].data, 'object');
      var row = result.rows[0].data;
      assert.strictEqual(row.name, value.name);
      assert.strictEqual(row.age, value.age);
      assert.strictEqual(row.alive, value.alive);
      test('row should have "now" as a date', function() {
        return false;
        assert(row.now instanceof Date, 'row.now should be a date instance but is ' + typeof row.now);
      });
      assert.equal(JSON.stringify(row.now), JSON.stringify(value.now));
      done();
      helper.pg.end();
    }));
  });
});

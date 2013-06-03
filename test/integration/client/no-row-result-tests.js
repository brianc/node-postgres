var helper = require(__dirname + '/test-helper');
var pg = helper.pg;
var config = helper.config;

test('can access results when no rows are returned', function() {
  if(config.native) return false;
  var checkResult = function(result) {
    assert(result.fields, 'should have fields definition');
    assert.equal(result.fields.length, 1);
    assert.equal(result.fields[0].name, 'val');
    assert.equal(result.fields[0].dataTypeID, 25);
    pg.end();
  };

  pg.connect(config, assert.success(function(client, done) {
    var query = client.query('select $1::text as val limit 0', ['hi'], assert.success(function(result) {
      checkResult(result);
      done();
    }));

    assert.emits(query, 'end', checkResult);
  }));
});

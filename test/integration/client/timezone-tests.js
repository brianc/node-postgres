var helper = require(__dirname + '/../test-helper');
var exec = require('child_process').exec;

var oldTz = process.env.TZ;
process.env.TZ = 'Europe/Berlin';

var date = new Date();

helper.pg.connect(helper.config, function(err, client, done) {
  assert.isNull(err);

  test('timestamp without time zone', function() {
    client.query("SELECT CAST($1 AS TIMESTAMP WITHOUT TIME ZONE) AS \"val\"", [ date ], function(err, result) {
      assert.isNull(err);
      assert.equal(result.rows[0].val.getTime(), date.getTime());

      test('timestamp with time zone', function() {
        client.query("SELECT CAST($1 AS TIMESTAMP WITH TIME ZONE) AS \"val\"", [ date ], function(err, result) {
          assert.isNull(err);
          assert.equal(result.rows[0].val.getTime(), date.getTime());

          done();
          helper.pg.end();
          process.env.TZ = oldTz;
        });
      });
    });
  });
});
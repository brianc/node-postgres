var helper = require('../test-helper');
var assert = require('assert');

helper.pg.connect(helper.config, function(err, client, done) {
  if (err) throw err;

  var c = 'CREATE TEMP TABLE numbers (n bigint)';

  client.query(c, function(err) {
    if (err) throw err;

    c = 'INSERT INTO numbers (n) VALUES ($1)';

    client.query(c, [123], function(err) {
      if (err) throw err;

      c = 'SELECT * FROM numbers WHERE n > 122.123 AND n < $1';

      client.query(c, [123.456], function(err, res) {
        done();

        if (err) throw err;
        assert.equal(res.rows[0].n, '123')
        helper.pg.end();
      });
    });
  });
});

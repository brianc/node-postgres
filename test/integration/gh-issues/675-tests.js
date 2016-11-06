var helper = require('../test-helper');
var assert = require('assert');
var bufferFrom = require('buffer-from');

helper.pg.connect(helper.config, function(err, client, done) {
  if (err) throw err;

  var c = 'CREATE TEMP TABLE posts (body TEXT)';

  client.query(c, function(err) {
    if (err) throw err;

    c = 'INSERT INTO posts (body) VALUES ($1) RETURNING *';

    var body = bufferFrom('foo');
    client.query(c, [body], function(err) {
      if (err) throw err;

      body = bufferFrom([]);
      client.query(c, [body], function(err, res) {
        done();

        if (err) throw err;
        assert.equal(res.rows[0].body, '')
        helper.pg.end();
      });
    });
  });
});

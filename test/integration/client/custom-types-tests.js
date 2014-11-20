var helper = require(__dirname + '/test-helper');
return console.log('TODO: get this working for non-native client');

helper.config.types = {
  getTypeParser: function() {
    return function() {
      return 'okay!'
    }
  }
};

helper.pg.connect(helper.config, assert.success(function(client, done) {
  client.query('SELECT NOW() as val', assert.success(function(res) {
    assert.equal(res.rows[0].val, 'okay!');
    done();
    helper.pg.end();
  }));
}));

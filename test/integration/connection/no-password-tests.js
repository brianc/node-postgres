var helper = require(__dirname+'/test-helper');
test('can log in with no password', function() {
  helper.authConnect(function(con) {
    assert.raises(con, 'readyForQuery', function() {
      con.end();
    });
  });
});

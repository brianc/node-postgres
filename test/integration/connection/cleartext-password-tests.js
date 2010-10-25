var helper = require(__dirname + '/test-helper');
test('can log in with clear text password', function() {
  helper.authConnect('user_pw', 'postgres', function(con) {
    assert.raises(con, 'authenticationCleartextPassword', function() {
      con.password('pass');
    });
    assert.raises(con, 'readyForQuery', function() {
      con.end();
    });
  });
});

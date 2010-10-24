var helper = require(__dirname + '/test-helper');

test('can log in with md5 password', function() {
  helper.authConnect('user_md5', 'postgres', function(con) {

    assert.raises(con, 'authenticationMD5Password', function(msg) {
      assert.ok(msg.salt);
      var enc = Client.md5('ssap' + 'user_md5');
      enc = Client.md5(enc + msg.salt.toString('binary'));
      con.passwordMessage('md5'+enc);
    });
    assert.raises(con, 'readyForQuery', function() {
      con.end();
    });
  });
});

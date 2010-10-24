var helper = require(__dirname + '/test-helper');

helper.authConnect('user_md5', 'postgres', function(con) {

  con.once('authenticationMD5Password', function(msg) {
    var enc = Client.md5('ssap' + 'user_md5');
    enc = Client.md5(enc + msg.salt.toString('binary'));
    con.passwordMessage('md5'+enc);
  });

  con.once('readyForQuery', function() {
    console.log('successfully connected with md5 password');
    con.end();
  });

});

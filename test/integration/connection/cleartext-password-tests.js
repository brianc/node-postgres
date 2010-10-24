var helper = require(__dirname + '/test-helper');

helper.authConnect('user_pw', 'postgres', function(con) {

  con.once('authenticationCleartextPassword', function() {
    con.passwordMessage('pass');
  });

  con.once('readyForQuery', function() {
    console.log('successfully connected with cleartext password');
    con.end();
  });

});


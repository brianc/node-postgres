var helper = require(__dirname+'/test-helper');
helper.authConnect(function(con) {
  con.once('readyForQuery', function() {
    console.log("Succesfully connected without a password");
    con.end();
  });
});

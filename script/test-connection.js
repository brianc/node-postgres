var helper = require(__dirname + '/../test/test-helper');

console.log();
console.log("testing ability to connect to '%j'", helper.config);
var pg = require(__dirname + '/../lib');
pg.connect(helper.config, function(err, client, done) {
  if(err !== null) {
    console.error("Recieved connection error when attempting to contact PostgreSQL:");
    console.error(err);
    process.exit(255);
  }
  console.log("Checking for existance of required test table 'person'")
  client.query("SELECT COUNT(name) FROM person", function(err, callback) {
    if(err != null) {
      console.error("Recieved error when executing query 'SELECT COUNT(name) FROM person'")
      console.error("It is possible you have not yet run the table create script under script/create-test-tables")
      console.error("Consult the postgres-node wiki under the 'Testing' section for more information")
      console.error(err);
      process.exit(255);
    }
    done();
    pg.end();
  })
})

var args = require(__dirname + '/../cli');
var pg = require(__dirname + "/../../lib");

process.on('uncaughtException', function(err) {
  console.log(err.message);
});

var query = {
  text: 'select * from person where id = $1'
  , values: [1]
};
var queries = 0;

pg.connect(args, function(err, client) {
  setTimeout(function() {
    throw new Error('#1');
  }, 500);

  setTimeout(function() {
    client.query(query, function(err, result) {
      console.log('ran first query');
      queries++;
      throw new Error('#2');
    });
  }, 1000);

  setTimeout(function() {
    client.query(query, function(err, result) {
      console.log('ran second query');
      queries++;
    });
  }, 1500);

  setTimeout(function() {
    client.end();
    if (queries !== 2) {
      throw new Error('test failed!');
    }
  }, 2000);

  setTimeout(function() {
    process.exit();
  }, 2500);

});

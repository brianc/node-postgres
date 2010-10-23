Client = require(__dirname+'/../../lib/client');
sys = require('sys');

//creates a configured, connecting client
var connect = function(onReady) {
  var con = new Client({
    database: 'postgres',
    user: 'brian'
  });
  con.connect();
  con.once('readyForQuery', function() {
    con.query('create temporary table ids(id integer)');
    con.once('readyForQuery', function() {
      con.query('insert into ids(id) values(1); insert into ids(id) values(2);');
      con.once('readyForQuery',function() {
        onReady(con);
      });
    });
  });
};

module.exports = {
  connect: connect
};

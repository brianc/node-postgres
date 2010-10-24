var net = require('net');
require(__dirname+'/../test-helper');

var authConnect = function(username, database, callback) {
  if(typeof username === 'function') {
    callback = username;
    username = 'brian';
    database = 'postgres';
  }
  var connection = new Connection({stream: new net.Stream()});
  connection.connect('5432','localhost');
  connection.once('connect', function() {
    connection.startupMessage({
      user: username,
      database: database
    });
    callback(connection);
  });
};

var connect = function(callback) {
  authConnect(function(con) {
    con.once('readyForQuery', function() {
      con.query('create temp table ids(id integer)');
    });
    con.once('readyForQuery', function() {
      con.query('insert into ids(id) values(1); insert into ids(id) values(2);');
    });
    con.once('readyForQuery', function() {
      callback(con);
    });

  });
};

module.exports = {
  authConnect: authConnect,
  connect: connect
};

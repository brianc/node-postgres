var net = require('net');
var helper = require(__dirname+'/../test-helper');

var authConnect = function(username, database, callback) {
  if(typeof username === 'function') {
    callback = username;
    username = helper.args.user;
    database = helper.args.database;
  }
  var connection = new Connection({stream: new net.Stream()});
  connection.on('error', function(error){
    console.log(error);
    throw new Error("Connection error");
  });
  connection.connect('5432','localhost');
  connection.once('connect', function() {
    connection.startup({
      user: username,
      database: database
    });
    connection.once('authenticationCleartextPassword', function(){
      connection.password(helper.args.password);
    });
    connection.once('authenticationMD5Password', function(msg){
      var inner = Client.md5(helper.args.password+helper.args.user);
      var outer = Client.md5(inner + msg.salt.toString('binary'));
      connection.password("md5"+outer);
    });
    callback(connection);
  });
};

var connect = function(callback) {
  authConnect(function(con) {
    con.once('readyForQuery', function() {
      con.query('create temp table ids(id integer)');
      con.once('readyForQuery', function() {
        con.query('insert into ids(id) values(1); insert into ids(id) values(2);');
        con.once('readyForQuery', function() {
          callback(con);
        });
      });
    });
  });
};

module.exports = {
  authConnect: authConnect,
  connect: connect
};

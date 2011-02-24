var net = require('net');
var helper = require(__dirname+'/../test-helper');
var Connection = require('connection');
var connect = function(callback) {
  var username = helper.args.user;
  var database = helper.args.database;
  var con = new Connection({stream: new net.Stream()});
  con.on('error', function(error){
    console.log(error);
    throw new Error("Connection error");
  });
  con.connect('5432','localhost');
  con.once('connect', function() {
    con.startup({
      user: username,
      database: database
    });
    con.once('authenticationCleartextPassword', function(){
      con.password(helper.args.password);
    });
    con.once('authenticationMD5Password', function(msg){
      var inner = Client.md5(helper.args.password+helper.args.user);
      var outer = Client.md5(inner + msg.salt.toString('binary'));
      con.password("md5"+outer);
    });
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
  connect: connect
};

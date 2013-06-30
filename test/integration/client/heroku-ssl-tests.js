var helper = require(__dirname + '/../test-helper');
var pg = helper.pg;

var host = 'ec2-107-20-224-218.compute-1.amazonaws.com';
var database = 'db6kfntl5qhp2';
var user = 'kwdzdnqpdiilfs';
var port = 5432;

var config = {
  host: host,
  port: port,
  database: database,
  user: user,
  ssl: true
};

//connect & disconnect from heroku
pg.connect(config, assert.success(function(client, done) {
  done();
  pg.end();
}));

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
  password: 'uaZoSSHgi7mVM7kYaROtusClKu',
  ssl: true
};

//connect & disconnect from heroku
pg.connect(config, assert.success(function(client, done) {
  client.query('SELECT NOW() as time', assert.success(function(res) {
    assert(res.rows[0].time.getTime());
    done();
    pg.end();
  }))
}));

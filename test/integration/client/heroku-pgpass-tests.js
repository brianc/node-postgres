var helper = require(__dirname + '/../test-helper');

// Path to the password file
var passfile = __dirname + '/heroku.pgpass';

// Export the path to the password file
process.env.PGPASSFILE = passfile;

// Do a chmod 660, because git doesn't track those permissions
require('fs').chmodSync(passfile, 384);

var pg = helper.pg;

var host = 'ec2-107-20-224-218.compute-1.amazonaws.com';
var database = 'db6kfntl5qhp2';
var user = 'kwdzdnqpdiilfs';

var config = {
  host: host,
  database: database,
  user: user,
  ssl: true
};

// connect & disconnect from heroku
pg.connect(config, assert.success(function(client, done) {
  client.query('SELECT NOW() as time', assert.success(function(res) {
    assert(res.rows[0].time.getTime());

    // cleanup ... remove the env variable
    delete process.env.PGPASSFILE;

    done();
    pg.end();
  }))
}));

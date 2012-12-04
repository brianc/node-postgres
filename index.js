var pg = require('./lib')

var Client = pg.Client;

pg.connect('pg://localhost/postgres', function(err, client) {
  console.log(err)
})


new Client({database: 'postgres'}).connect(function(err) {
  console.log(err);
  console.log('connected')
})

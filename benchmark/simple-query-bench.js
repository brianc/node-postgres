var pg = require(__dirname + '/../lib')
var bencher = require('bencher');
var helper = require(__dirname + '/../test/test-helper')
var conString = helper.connectionString()

var doBenchmark = function() {
  var bench = bencher({
    repeat: 3000,
    actions: [{
      name: 'simple query',
      run: function(next) {
        var query = client.query('SELECT name FROM person WHERE age > 10');
        query.on('end', function() {
          next();
        });
      }
    },{
      name: 'unnamed prepared statement',
      run: function(next) {
        var query = client.query('SELECT name FROM person WHERE age > $1', [10]);
        query.on('end', function() {
          next();
        });
      }
    },{
      name: 'named prepared statement',
      run: function(next) {
        var config = {
          name: 'get peeps',
          text: 'SELECT name FROM person WHERE age > $1',
          values: [10]
        }
        client.query(config).on('end', function() {
          next();
        });
      }
    }]
  });
  bench(function(result) {
    console.log();
    result.actions.forEach(function(action) {
      console.log("%s -> %d", action.name, action.meanTime);
    })
    client.end();
  })
}

var client = new pg.Client(conString);
client.connect();
client.connection.once('readyForQuery', doBenchmark)

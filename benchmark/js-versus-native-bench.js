var pg = require(__dirname + '/../lib')
var pgNative = require(__dirname + '/../lib/native');
var bencher = require('bencher');
var helper = require(__dirname + '/../test/test-helper')
var conString = helper.connectionString()

var round = function(num) {
  return Math.round((num*1000))/1000
}

var doBenchmark = function() {
  var bench = bencher({
    name: 'js/native compare',
    repeat: 1000,
    actions: [{
      name: 'javascript client - simple query',
      run: function(next) {
        var query = client.query('SELECT name, age FROM person WHERE age > 10');
        query.on('end', function() {
          next();
        });
      }
    },{
      name: 'native client - simple query',
      run: function(next) {
        var query = nativeClient.query('SELECT name FROM person WHERE age > $1', [10]);
        query.on('end', function() {
          next();
        });
      }
    }, {
      name: 'javascript client - parameterized query',
      run: function(next) {
        var query = client.query('SELECT name, age FROM person WHERE age > $1', [10]);
        query.on('end', function() {
          next();
        });
      }
    },{
      name: 'native client - parameterized query',
      run: function(next) {
        var query = nativeClient.query('SELECT name, age FROM person WHERE age > $1', [10]);
        query.on('end', function() {
          next();
        });
      }
    }]
  });
  bench(function(result) {
    console.log();
    console.log("%s (%d repeats):", result.name, result.repeat)
    result.actions.forEach(function(action) {
      console.log("  %s: \n    average: %d ms\n    total: %d ms", action.name, round(action.meanTime), round(action.totalTime));
    })
    client.end();
    nativeClient.end();
  })
}

var client = new pg.Client(conString);
var nativeClient = new pgNative.Client(conString);
client.connect();
client.on('connect', function() {
  nativeClient.connect();
  nativeClient.on('connect', function() {
    doBenchmark();
  });
});

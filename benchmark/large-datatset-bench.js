var pg = require(__dirname + '/../lib')
var bencher = require('bencher');
var helper = require(__dirname + '/../test/test-helper')
var conString = helper.connectionString()

var round = function(num) {
  return Math.round((num*1000))/1000
}

var doBenchmark = function(cb) {
  var bench = bencher({
    name: 'select large sets',
    repeat: 10,
    actions: [{
      name: 'selecting string',
      run: function(next) {
        var query = client.query('SELECT name FROM items');
        query.on('error', function(er) {
          console.log(er);throw er;
        });

        query.on('end', function() {
          next();
        });
      }
    }, {
      name: 'selecting integer',
      run: function(next) {
        var query = client.query('SELECT count FROM items');
        query.on('error', function(er) {
          console.log(er);throw er;
        });

        query.on('end', function() {
          next();
        })
      }
    }, {
      name: 'selecting date',
      run: function(next) {
        var query = client.query('SELECT created FROM items');
        query.on('error', function(er) {
          console.log(er);throw er;
        });

        query.on('end', function() {
          next();
        })
      }
    }, {
      name: 'selecting row',
      run: function(next) {
        var query = client.query('SELECT * FROM items');
        query.on('end', function() {
          next();
        })
      }
    }, {
      name: 'loading all rows into memory',
      run: function(next) {
        var query = client.query('SELECT * FROM items', next);
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
    cb();
  })
}


var client = new pg.Client(conString);
client.connect();
console.log();
console.log("creating temp table");
client.query("CREATE TEMP TABLE items(name VARCHAR(10), created TIMESTAMPTZ, count INTEGER)");
var count = 10000;
console.log("inserting %d rows", count);
for(var i = 0; i < count; i++) {
  var query = {
    name: 'insert',
    text: "INSERT INTO items(name, created, count) VALUES($1, $2, $3)",
    values: ["item"+i, new Date(2010, 01, 01, i, 0, 0), i]
  };
  client.query(query);
}

client.once('drain', function() {
  console.log('done with insert. executing pure-javascript benchmark.');
  doBenchmark(function() {
    var oldclient = client;
    client = new pg.native.Client(conString);
    client.on('error', function(err) {
      console.log(err);
      throw err;
    });

    client.connect();
    client.connect();
    console.log();
    console.log("creating temp table");
    client.query("CREATE TEMP TABLE items(name VARCHAR(10), created TIMESTAMPTZ, count INTEGER)");
    var count = 10000;
    console.log("inserting %d rows", count);
    for(var i = 0; i < count; i++) {
      var query = {
        name: 'insert',
        text: "INSERT INTO items(name, created, count) VALUES($1, $2, $3)",
        values: ["item"+i, new Date(2010, 01, 01, i, 0, 0), i]
      };
      client.query(query);
    }
    client.once('drain', function() {
      console.log("executing native benchmark");
      doBenchmark(function() {
        console.log("all done");
      })
    })
  });
});

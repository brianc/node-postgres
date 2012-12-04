var helper = require(__dirname + '/../test-helper');
var pg = require(__dirname + '/../../../lib');

if(helper.args.native) {
  pg = require(__dirname + '/../../../lib').native;
}

var log = function() {
  //console.log.apply(console, arguments);
}

var sink = new helper.Sink(5, 10000, function() {
  log("ending connection pool: %j", helper.config);
  pg.end(helper.config);
});

test('api', function() {
  log("connecting to %j", helper.config)
  //test weird callback behavior with node-pool
  pg.connect(helper.config, function(err) {
    assert.isNull(err);
    arguments[1].emit('drain');
  });
  pg.connect(helper.config, assert.calls(function(err, client) {
    assert.equal(err, null, "Failed to connect: " + helper.sys.inspect(err));

    client.query('CREATE TEMP TABLE band(name varchar(100))');

    ['the flaming lips', 'wolf parade', 'radiohead', 'bright eyes', 'the beach boys', 'dead black hearts'].forEach(function(bandName) {
      var query = client.query("INSERT INTO band (name) VALUES ('"+ bandName +"')")
    });


    test('simple query execution',assert.calls( function() {
      log("executing simple query")
      client.query("SELECT * FROM band WHERE name = 'the beach boys'", assert.calls(function(err, result) {
        assert.lengthIs(result.rows, 1)
        assert.equal(result.rows.pop().name, 'the beach boys')
        log("simple query executed")
      }));

    }))

    test('prepared statement execution',assert.calls( function() {
      log("executing prepared statement 1")
      client.query('SELECT * FROM band WHERE name = $1', ['dead black hearts'],assert.calls( function(err, result) {
        log("Prepared statement 1 finished")
        assert.lengthIs(result.rows, 1);
        assert.equal(result.rows.pop().name, 'dead black hearts');
      }))

      log("executing prepared statement two")
      client.query('SELECT * FROM band WHERE name LIKE $1 ORDER BY name', ['the %'], assert.calls(function(err, result) {
        log("prepared statement two finished")
        assert.lengthIs(result.rows, 2);
        assert.equal(result.rows.pop().name, 'the flaming lips');
        assert.equal(result.rows.pop().name, 'the beach boys');
        sink.add();
      }))
    }))

  }))
})

test('executing nested queries', function() {
  pg.connect(helper.config, assert.calls(function(err, client) {
    assert.isNull(err);
    log("connected for nested queriese")
    client.query('select now as now from NOW()', assert.calls(function(err, result) {
      assert.equal(new Date().getYear(), result.rows[0].now.getYear())
      client.query('select now as now_again FROM NOW()', assert.calls(function() {
        client.query('select * FROM NOW()', assert.calls(function() {
          log('all nested queries recieved')
          assert.ok('all queries hit')
          sink.add();
        }))
      }))
    }))
  }))
})

test('raises error if cannot connect', function() {
  var connectionString = "pg://sfalsdkf:asdf@localhost/ieieie";
  log("trying to connect to invalid place for error")
  pg.connect(connectionString, assert.calls(function(err, client) {
    assert.ok(err, 'should have raised an error')
    log("invalid connection supplied error to callback")
    sink.add();
  }))
})

test("query errors are handled and do not bubble if callback is provded", function() {
  pg.connect(helper.config, assert.calls(function(err, client) {
    assert.isNull(err)
    log("checking for query error")
    client.query("SELECT OISDJF FROM LEIWLISEJLSE", assert.calls(function(err, result) {
      assert.ok(err);
      log("query error supplied error to callback")
      sink.add();
    }))
  }))
})

test('callback is fired once and only once', function() {
  pg.connect(helper.config, assert.calls(function(err, client) {
    assert.isNull(err);
    client.query("CREATE TEMP TABLE boom(name varchar(10))");
    var callCount = 0;
    client.query([
      "INSERT INTO boom(name) VALUES('hai')",
      "INSERT INTO boom(name) VALUES('boom')",
      "INSERT INTO boom(name) VALUES('zoom')",
    ].join(";"), function(err, callback) {
      assert.equal(callCount++, 0, "Call count should be 0.  More means this callback fired more than once.");
      sink.add();
    })
  }))
})

test('can provide callback and config object', function() {
  pg.connect(helper.config, assert.calls(function(err, client) {
    assert.isNull(err);
    client.query({
      name: 'boom',
      text: 'select NOW()'
    }, assert.calls(function(err, result) {
      assert.isNull(err);
      assert.equal(result.rows[0].now.getYear(), new Date().getYear())
    }))
  }))
})

test('can provide callback and config and parameters', function() {
  pg.connect(helper.config, assert.calls(function(err, client) {
    assert.isNull(err);
    var config = {
      text: 'select $1::text as val'
    };
    client.query(config, ['hi'], assert.calls(function(err, result) {
      assert.isNull(err);
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].val, 'hi');
    }))
  }))
})

test('null and undefined are both inserted as NULL', function() {
  pg.connect(helper.config, assert.calls(function(err, client) {
    assert.isNull(err);
    client.query("CREATE TEMP TABLE my_nulls(a varchar(1), b varchar(1), c integer, d integer, e date, f date)");
    client.query("INSERT INTO my_nulls(a,b,c,d,e,f) VALUES ($1,$2,$3,$4,$5,$6)", [ null, undefined, null, undefined, null, undefined ]);
    client.query("SELECT * FROM my_nulls", assert.calls(function(err, result) {
        assert.isNull(err);
        assert.equal(result.rows.length, 1);
        assert.isNull(result.rows[0].a);
        assert.isNull(result.rows[0].b);
        assert.isNull(result.rows[0].c);
        assert.isNull(result.rows[0].d);
        assert.isNull(result.rows[0].e);
        assert.isNull(result.rows[0].f);
    }))
  }))
})

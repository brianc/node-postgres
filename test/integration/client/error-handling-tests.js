"use strict";
"use strict";

var helper = require('./test-helper');
var util = require('util');

var pg = helper.pg

var createErorrClient = function() {
  var client = helper.client();
  client.once('error', function(err) {
    assert.fail('Client shoud not throw error during query execution');
  });
  client.on('drain', client.end.bind(client));
  return client;
};

const suite = new helper.Suite('error handling')

suite.test('query receives error on client shutdown', function(done) {
  var client = new Client();
  client.connect(assert.success(function() {
    const config = {
      text: 'select pg_sleep(5)',
      name: 'foobar'
    }
    let queryError;
    client.query(new pg.Query(config), assert.calls(function(err, res) {
      assert(err instanceof Error)
      queryError = err
    }));
    setTimeout(() => client.end(), 50)
    client.once('end', () => {
      assert(queryError instanceof Error)
      done()
    })
  }));
});

  var ensureFuture = function (testClient, done) {
    var goodQuery = testClient.query(new pg.Query("select age from boom"));
    assert.emits(goodQuery, 'row', function (row) {
      assert.equal(row.age, 28);
      done();
    });
  };

  suite.test("when query is parsing", (done) => {
    var client = createErorrClient();

    var q = client.query({ text: "CREATE TEMP TABLE boom(age integer); INSERT INTO boom (age) VALUES (28);" });


    //this query wont parse since there isn't a table named bang
    var query = client.query(new pg.Query({
      text: "select * from bang where name = $1",
      values: ['0']
    }));

    assert.emits(query, 'error', function (err) {
      ensureFuture(client, done);
    });
  });

  suite.test("when a query is binding", function (done) {
    var client = createErorrClient();

    var q = client.query({ text: "CREATE TEMP TABLE boom(age integer); INSERT INTO boom (age) VALUES (28);" });


    var query = client.query(new pg.Query({
      text: 'select * from boom where age = $1',
      values: ['asldkfjasdf']
    }));

    assert.emits(query, 'error', function (err) {
      assert.equal(err.severity, "ERROR");
      ensureFuture(client, done);
    });
  });

suite.test('non-query error with callback', function(done) {
  var client = new Client({
    user:'asldkfjsadlfkj'
  });
  client.connect(assert.calls(function(error, client) {
    assert(error instanceof Error)
    done()
  }));
});

suite.test('non-error calls supplied callback', function(done) {
  var client = new Client({
    user: helper.args.user,
    password: helper.args.password,
    host: helper.args.host,
    port: helper.args.port,
    database: helper.args.database
  });

  client.connect(assert.calls(function(err) {
    assert.ifError(err);
    client.end(done);
  }))
});

suite.test('when connecting to an invalid host with callback', function (done) {
  var client = new Client({
    user: 'very invalid username',
  });
  client.connect(function(error, client) {
    assert(error instanceof Error);
    done();
  });
});

suite.test('when connecting to invalid host with promise', function(done) {
  var client = new Client({
    user: 'very invalid username'
  });
  client.connect().catch((e) => done());
});

suite.test('non-query error', function(done) {
  var client = new Client({
    user:'asldkfjsadlfkj'
  });
  client.connect()
    .catch(e => {
      assert(e instanceof Error)
      done()
    })
});

suite.test('within a simple query', (done) => {
  var client = createErorrClient();

  var query = client.query(new pg.Query("select eeeee from yodas_dsflsd where pixistix = 'zoiks!!!'"));

  assert.emits(query, 'error', function(error) {
    assert.equal(error.severity, "ERROR");
    done();
  });
});

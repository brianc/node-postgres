#node-postgres

[![Build Status](https://secure.travis-ci.org/brianc/node-postgres.svg?branch=master)](http://travis-ci.org/brianc/node-postgres)
![io.js supported](https://img.shields.io/badge/io.js-supported-green.svg)

PostgreSQL client for node.js.  Pure JavaScript and optional native libpq bindings.

## Install

```sh
$ npm install pg
```


## Examples

### Client pooling

Generally you will access the PostgreSQL server through a pool of clients.  A client takes a non-trivial amount of time to establish a new connection. A client also consumes a non-trivial amount of resources on the PostgreSQL server - not something you want to do on every http request. Good news: node-postgres ships with built in client pooling.

```javascript
var pg = require('pg');
var conString = "postgres://username:password@localhost/database";

//this initializes a connection pool
//it will keep idle connections open for a (configurable) 30 seconds
//and set a limit of 20 (also configurable)
pg.connect(conString, function(err, client, done) {
  if(err) {
    return console.error('error fetching client from pool', err);
  }
  client.query('SELECT $1::int AS number', ['1'], function(err, result) {
    //call `done()` to release the client back to the pool
    done();

    if(err) {
      return console.error('error running query', err);
    }
    console.log(result.rows[0].number);
    //output: 1
  });
});
```

[Check this out for the get up and running quickly example](https://github.com/brianc/node-postgres/wiki/Example)

### Client instance

Sometimes you may not want to use a pool of connections.  You can easily connect a single client to a postgres instance, run some queries, and disconnect.

```javascript
var pg = require('pg');

var conString = "postgres://username:password@localhost/database";

var client = new pg.Client(conString);
client.connect(function(err) {
  if(err) {
    return console.error('could not connect to postgres', err);
  }
  client.query('SELECT NOW() AS "theTime"', function(err, result) {
    if(err) {
      return console.error('error running query', err);
    }
    console.log(result.rows[0].theTime);
    //output: Tue Jan 15 2013 19:12:47 GMT-600 (CST)
    client.end();
  });
});

```

## [More Documentation](https://github.com/brianc/node-postgres/wiki)

## Native Bindings

To install the [native bindings](https://github.com/brianc/node-pg-native.git):

```sh
$ npm install pg pg-native
```


node-postgres contains a pure JavaScript protocol implementation which is quite fast, but you can optionally use native bindings for a 20-30% increase in parsing speed. Both versions are adequate for production workloads.

To use the native bindings, first install [pg-native](https://github.com/brianc/node-pg-native.git).  Once pg-native is installed, simply replace `require('pg')` with `require('pg').native`.

node-postgres abstracts over the pg-native module to provide exactly the same interface as the pure JavaScript version. __No other code changes are required__.  If you find yourself having to change code other than the require statement when switching from `require('pg')` to `require('pg').native` please report an issue.

## Features

* pure JavaScript client and native libpq bindings share _the same api_
* optional connection pooling
* extensible js<->postgresql data-type coercion
* supported PostgreSQL features
  * parameterized queries
  * named statements with query plan caching
  * async notifications with `LISTEN/NOTIFY`
  * bulk import & export with `COPY TO/COPY FROM`

## Contributing

__We love contributions!__

If you need help getting the tests running locally or have any questions about the code when working on a patch please feel free to email me or gchat me.

I will __happily__ accept your pull request if it:
- __has tests__
- looks reasonable
- does not break backwards compatibility

Information about the testing processes is in the [wiki](https://github.com/brianc/node-postgres/wiki/Testing).

Open source belongs to all of us, and we're all invited to participate!

## Support

If at all possible when you open an issue please provide
- version of node
- version of postgres
- smallest possible snippet of code to reproduce the problem

Usually I'll pop the code into the repo as a test.  Hopefully the test fails.  Then I make the test pass.  Then everyone's happy!

If you need help or run into _any_ issues getting node-postgres to work on your system please report a bug or contact me directly.  I am usually available via google-talk at my github account public email address.

I usually tweet about any important status updates or changes to node-postgres on twitter.
Follow me [@briancarlson](https://twitter.com/briancarlson) to keep up to date.


## Extras

node-postgres is by design pretty light on abstractions.  These are some handy modules we've been using over the years to complete the picture:

- [brianc/node-pg-native](https://github.com/brianc/node-pg-native) - Simple interface abstraction on top of [libpq](https://github.com/brianc/node-libpq)
- [brianc/node-pg-query-stream](https://github.com/brianc/node-pg-query-stream) - Query results from node-postgres as a readable (object) stream
- [brianc/node-pg-cursor](https://github.com/brianc/node-pg-cursor) - Query cursor extension for node-postgres
- [brianc/node-pg-copy-streams](https://github.com/brianc/node-pg-copy-streams) - COPY FROM / COPY TO for node-postgres. Stream from one database to another, and stuff.
- [brianc/node-postgres-pure](https://github.com/brianc/node-postgres-pure) - node-postgres without any of the C/C++ stuff
- [brianc/node-pg-types](https://github.com/brianc/node-pg-types) - Type parsing for node-postgres
- [Suor/pg-bricks](https://github.com/Suor/pg-bricks) - A higher level wrapper around node-postgres to handle connection settings, sql generation, transactions and ease data access.
- [grncdr/node-any-db](https://github.com/grncdr/node-any-db) - Thin and less-opinionated database abstraction layer for node.
- [brianc/node-sql](https://github.com/brianc/node-sql) - SQL generation for node.js
- [hiddentao/squel](https://hiddentao.github.io/squel/) - SQL query string builder for Javascript
- [CSNW/sql-bricks](https://github.com/CSNW/sql-bricks) - Transparent, Schemaless SQL Generation
- [datalanche/node-pg-format](https://github.com/datalanche/node-pg-format) - Safely and easily create dynamic SQL queries with this Node implementation of [PostgreSQL format()](http://www.postgresql.org/docs/9.3/static/functions-string.html#FUNCTIONS-STRING-FORMAT).
- [iceddev/pg-transact](https://github.com/iceddev/pg-transact) - A nicer API on node-postgres transactions
- [sehrope/node-pg-db](https://github.com/sehrope/node-pg-db) - Simpler interface, named parameter support, transaction management and event hooks.
- [vitaly-t/pg-promise](https://github.com/vitaly-t/pg-promise) - Use node-postgres via [Promises/A+](https://promisesaplus.com/).
- [pg-then](https://github.com/coderhaoxin/pg-then) A tiny wrapper of `pg` for promise api.
- [pg-rxjs](https://github.com/jadbox/pg-rxjs) Another tiny wrapper like `pg-then` but for [RxJS](https://github.com/Reactive-Extensions/RxJS)
- [acarl/pg-restify](https://github.com/acarl/pg-restify) - Creates a generic REST API for a postgres database using restify.
- [XeCycle/pg-template-tag](https://github.com/XeCycle/pg-template-tag) - Write queries with ES6 tagged template literals, a "poor man's query builder".
- [recursivefunk/pg-gen](https://github.com/recursivefunk/pg-gen) - Use ES6 Generators to paginate through large Postgres result sets
- [vitaly-t/pg-minify](https://github.com/vitaly-t/pg-minify) - Minifies PostgreSQL scripts.
- [MassiveJS](https://github.com/robconery/massive-js) - A simple relational data access tool that has full JSONB document support for Postgres.

## License

Copyright (c) 2010-2015 Brian Carlson (brian.m.carlson@gmail.com)

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.

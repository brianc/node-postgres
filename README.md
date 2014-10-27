#node-postgres

[![Build Status](https://secure.travis-ci.org/brianc/node-postgres.png?branch=master)](http://travis-ci.org/brianc/node-postgres)

PostgreSQL client for node.js.  Pure JavaScript and native libpq bindings.

## Installation

    npm install pg


## Examples

### Client pooling

Generally you will access the PostgreSQL server through a pool of clients.  A client takes a non-trivial amount of time to establish a new connection. A client also consumes a non-trivial amount of resources on the PostgreSQL server - not something you want to do on every http request. Good news: node-postgres ships with built in client pooling.

```javascript
var pg = require('pg');
var conString = "postgres://username:password@localhost/database";

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

### Simple

Sometimes you may not want to use a pool of connections.  You can easily connect a single client to a postgres instance, run a query, and disconnect.

```javascript
var pg = require('pg'); 
//or native libpq bindings
//var pg = require('pg').native

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

## [Documentation](https://github.com/brianc/node-postgres/wiki)

## Native Bindings

node-postgres contains a pure JavaScript driver and also exposes JavaScript bindings via libpq.  You can use either interface.  I personally use the JavaScript bindings as they are quite fast, and I like having everything implemented in JavaScript.

To use native libpq bindings replace `require('pg')` with `require('pg').native`.  If you __do not__ need or want the native bindings at all, consider using [node-postgres-pure](https://github.com/brianc/node-postgres-pure) instead which does not include them.

The two share the same interface so __no other code changes should be required__.  If you find yourself having to change code other than the require statement when switching from `pg` to `pg.native` or `pg.js`, please report an issue.

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

__I love contributions.__

You are welcome contribute via pull requests.  If you need help getting the tests running locally feel free to email me or gchat me.

I will __happily__ accept your pull request if it:
- __has tests__
- looks reasonable
- does not break backwards compatibility
- satisfies jshint

Information about the testing processes is in the [wiki](https://github.com/brianc/node-postgres/wiki/Testing).

If you need help or have questions about constructing a pull request I'll be glad to help out as well.

## Support

If at all possible when you open an issue please provide
- version of node
- version of postgres
- smallest possible snippet of code to reproduce the problem

Usually I'll pop the code into the repo as a test.  Hopefully the test fails.  Then I make the test pass.  Then everyone's happy!


If you need help or run into _any_ issues getting node-postgres to work on your system please report a bug or contact me directly.  I am usually available via google-talk at my github account public email address.

I usually tweet about any important status updates or changes to node-postgres.  
Follow me [@briancarlson](https://twitter.com/briancarlson) to keep up to date.


## Extras

node-postgres is by design _low level_ with the bare minimum of abstraction.  These might help out:

- [brianc/node-pg-native](https://github.com/brianc/node-pg-native) - Simple interface abstraction on top of [libpq](https://github.com/brianc/node-libpq)
- [brianc/node-pg-query-stream](https://github.com/brianc/node-pg-query-stream) - Query results from node-postgres as a readable (object) stream
- [brianc/node-pg-cursor](https://github.com/brianc/node-pg-cursor) - Query cursor extension for node-postgres
- [brianc/node-pg-copy-streams](https://github.com/brianc/node-pg-copy-streams) - COPY FROM / COPY TO for node-postgres. Stream from one database to another, and stuff.
- [brianc/node-postgres-pure](https://github.com/brianc/node-postgres-pure) - node-postgres without any of the C/C++ stuff
- [brianc/node-pg-types](https://github.com/brianc/node-pg-types) - Type parsing for node-postgres
- [Suor/pg-bricks](https://github.com/Suor/pg-bricks) - A higher level wrapper around node-postgres to handle connection settings, sql generation, transactions and ease data access.
- [grncdr/node-any-db](https://github.com/grncdr/node-any-db) - Thin and less-opinionated database abstraction layer for node.
- [brianc/node-sql](https://github.com/brianc/node-sql) - SQL generation for node.js
- [hiddentao/suqel](https://hiddentao.github.io/squel/) - SQL query string builder for Javascript
- [CSNW/sql-bricks](https://github.com/CSNW/sql-bricks) - Transparent, Schemaless SQL Generation
- [datalanche/node-pg-format](https://github.com/datalanche/node-pg-format) - Safely and easily create dynamic SQL queries with this Node implementation of [PostgreSQL format()](http://www.postgresql.org/docs/9.3/static/functions-string.html#FUNCTIONS-STRING-FORMAT).


### Windows
 
 1. Install Visual Studio C++ (successfully built with Express 2010). Express is free.
 2. Add your Postgre Installation's `bin` folder to the system path (i.e. `C:\Program Files\PostgreSQL\9.3\bin`).
 3. Make sure that both `libpq.dll` and `pg_config.exe` are in that folder.
 4. `npm install pg`


## License

Copyright (c) 2010-2014 Brian Carlson (brian.m.carlson@gmail.com)

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

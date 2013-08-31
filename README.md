#node-postgres

[![Build Status](https://secure.travis-ci.org/brianc/node-postgres.png?branch=master)](http://travis-ci.org/brianc/node-postgres)

PostgreSQL client for node.js.  Pure JavaScript and native libpq bindings.

## Installation

    npm install pg
       
## Examples

### Simple

Connect to a postgres instance, run a query, and disconnect.

```javascript
var pg = require('pg'); 
//or native libpq bindings
//var pg = require('pg').native

var conString = "postgres://postgres:1234@localhost/postgres";

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

### Client pooling

Typically you will access the PostgreSQL server through a pool of clients.  node-postgres ships with a built in pool to help get you up and running quickly.

```javascript
var pg = require('pg');
var conString = "postgres://postgres:1234@localhost/postgres";

pg.connect(conString, function(err, client, done) {
  if(err) {
  	return console.error('error fetching client from pool', err);
  }
  client.query('SELECT $1::int AS numbor', ['1'], function(err, result) {
    //call `done()` to release the client back to the pool
    done();
    
    if(err) {
      return console.error('error running query', err);
    }
    console.log(result.rows[0].numbor);
    //output: 1
  });
});

```

## Documentation

Documentation is a work in progress primarily taking place on the github WIKI

### [Documentation](https://github.com/brianc/node-postgres/wiki)

## Native Bindings

node-postgres contains a pure JavaScript driver and also exposes JavaScript bindings to libpq.  You can use either interface.  I personally use the JavaScript bindings as the are quite fast, and I like having everything implemented in JavaScript.

To use native libpq bindings replace `require('pg')` with `require('pg').native`.

The two share the same interface so __no other code changes should be required__.  If you find yourself having to change code other than the require statement when switching from `pg` to `pg.native`, please report an issue.

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
- _has tests_
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

- https://github.com/grncdr/node-any-db
- https://github.com/brianc/node-sql


## Production Use
* [yammer.com](http://www.yammer.com)
* [bayt.com](http://bayt.com)
* [bitfloor.com](https://bitfloor.com)
* [Vendly](http://www.vend.ly)
* [SaferAging](http://www.saferaging.com)
* [CartoDB](http://www.cartodb.com)
* [Heap](https://heapanalytics.com)
* [zoomsquare](http://www.zoomsquare.com/)

_If you use node-postgres in production and would like your site listed here, fork & add it._


## License

Copyright (c) 2010 Brian Carlson (brian.m.carlson@gmail.com)

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

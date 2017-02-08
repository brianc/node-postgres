#node-postgres

[![Build Status](https://secure.travis-ci.org/brianc/node-postgres.svg?branch=master)](http://travis-ci.org/brianc/node-postgres)
[![Dependency Status](https://david-dm.org/brianc/node-postgres.svg)](https://david-dm.org/brianc/node-postgres)
<span class="badge-npmversion"><a href="https://npmjs.org/package/pg" title="View this project on NPM"><img src="https://img.shields.io/npm/v/pg.svg" alt="NPM version" /></a></span>
<span class="badge-npmdownloads"><a href="https://npmjs.org/package/pg" title="View this project on NPM"><img src="https://img.shields.io/npm/dm/pg.svg" alt="NPM downloads" /></a></span>

Non-blocking PostgreSQL client for node.js.  Pure JavaScript and optional native libpq bindings.

## Install

```sh
$ npm install pg
```

## Intro & Examples

### Simple example

```js
var pg = require('pg');

// instantiate a new client
// the client will read connection information from
// the same environment variables used by postgres cli tools
var client = new pg.Client();

// connect to our database
client.connect(function (err) {
  if (err) throw err;

  // execute a query on our database
  client.query('SELECT $1::text as name', ['brianc'], function (err, result) {
    if (err) throw err;

    // just print the result to the console
    console.log(result.rows[0]); // outputs: { name: 'brianc' }

    // disconnect the client
    client.end(function (err) {
      if (err) throw err;
    });
  });
});

```

### Client pooling

If you're working on something like a web application which makes frequent queries you'll want to access the PostgreSQL server through a pool of clients.  Why?  For one thing, there is ~20-30 millisecond delay (YMMV) when connecting a new client to the PostgreSQL server because of the startup handshake.  Furthermore, PostgreSQL can support only a limited number of clients...it depends on the amount of ram on your database server, but generally more than 100 clients at a time is a __very bad thing__. :tm: Additionally, PostgreSQL can only execute 1 query at a time per connected client, so pipelining all queries for all requests through a single, long-lived client will likely introduce a bottleneck into your application if you need high concurrency.

With that in mind we can imagine a situation where you have a web server which connects and disconnects a new client for every web request or every query (don't do this!).  If you get only 1 request at a time everything will seem to work fine, though it will be a touch slower due to the connection overhead. Once you get >100 simultaneous requests your web server will attempt to open 100 connections to the PostgreSQL backend and :boom: you'll run out of memory on the PostgreSQL server, your database will become unresponsive, your app will seem to hang, and everything will break. Boooo!

__Good news__: node-postgres ships with built in client pooling.  Client pooling allows your application to use a pool of already connected clients and reuse them for each request to your application.  If your app needs to make more queries than there are available clients in the pool the queries will queue instead of overwhelming your database & causing a cascading failure. :thumbsup:

```javascript
var pg = require('pg');

// create a config to configure both pooling behavior
// and client options
// note: all config is optional and the environment variables
// will be read if the config is not present
var config = {
  user: 'foo', //env var: PGUSER
  database: 'my_db', //env var: PGDATABASE
  password: 'secret', //env var: PGPASSWORD
  host: 'localhost', // Server hosting the postgres database
  port: 5432, //env var: PGPORT
  max: 10, // max number of clients in the pool
  idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
};


//this initializes a connection pool
//it will keep idle connections open for a 30 seconds
//and set a limit of maximum 10 idle clients
var pool = new pg.Pool(config);

// to run a query we can acquire a client from the pool,
// run a query on the client, and then return the client to the pool
pool.connect(function(err, client, done) {
  if(err) {
    return console.error('error fetching client from pool', err);
  }
  client.query('SELECT $1::int AS number', ['1'], function(err, result) {
    //call `done(err)` to release the client back to the pool (or destroy it if there is an error)
    done(err);

    if(err) {
      return console.error('error running query', err);
    }
    console.log(result.rows[0].number);
    //output: 1
  });
});

pool.on('error', function (err, client) {
  // if an error is encountered by a client while it sits idle in the pool
  // the pool itself will emit an error event with both the error and
  // the client which emitted the original error
  // this is a rare occurrence but can happen if there is a network partition
  // between your application and the database, the database restarts, etc.
  // and so you might want to handle it and at least log it out
  console.error('idle client error', err.message, err.stack)
})
```

node-postgres uses [pg-pool](https://github.com/brianc/node-pg-pool.git) to manage pooling. It bundles it and exports it for convenience.  If you want, you can `require('pg-pool')` and use it directly - it's the same as the constructor exported at `pg.Pool`.

It's __highly recommended__ you read the documentation for [pg-pool](https://github.com/brianc/node-pg-pool.git).


[Here is an up & running quickly example](https://github.com/brianc/node-postgres/wiki/Example)


For more information about `config.ssl` check [TLS (SSL) of nodejs](https://nodejs.org/dist/latest-v4.x/docs/api/tls.html)

## [More Documentation](https://github.com/brianc/node-postgres/wiki)

## Native Bindings

To install the [native bindings](https://github.com/brianc/node-pg-native.git):

```sh
$ npm install pg pg-native
```


node-postgres contains a pure JavaScript protocol implementation which is quite fast, but you can optionally use [native](https://github.com/brianc/node-pg-native) [bindings](https://github.com/brianc/node-libpq) for a 20-30% increase in parsing speed (YMMV). Both versions are adequate for production workloads. I personally use the pure JavaScript implementation because I like knowing what's going on all the way down to the binary on the socket, and it allows for some fancier [use](https://github.com/brianc/node-pg-cursor) [cases](https://github.com/brianc/node-pg-query-stream) which are difficult to do with libpq. :smile:

To use the native bindings, first install [pg-native](https://github.com/brianc/node-pg-native.git).  Once pg-native is installed, simply replace `var pg = require('pg')` with `var pg = require('pg').native`.  Make sure any exported constructors from `pg` are from the native instance.  Example:

```js
var pg = require('pg').native
var Pool = require('pg').Pool // bad! this is not bound to the native client
var Client = require('pg').Client // bad! this is the pure JavaScript client

var pg = require('pg').native
var Pool = pg.Pool // good! a pool bound to the native client
var Client = pg.Client // good! this client uses libpq bindings
```

#### API differences

node-postgres abstracts over the pg-native module to provide the same interface as the pure JavaScript version. Care has been taken to keep the number of api differences between the two modules to a minimum.  
However, currently some differences remain, especially :
* the error object in pg-native is different : notably, the information about the postgres error code is not present in field `code` but in the field `sqlState` , and the name of a few other fields is different (see https://github.com/brianc/node-postgres/issues/938, https://github.com/brianc/node-postgres/issues/972).
So for example, if you rely on error.code in your application, your will have to adapt your code to work with native bindings.
* the notification object has a few less properties  (see https://github.com/brianc/node-postgres/issues/1045)
* column objects have less properties (see https://github.com/brianc/node-postgres/issues/988)
* the modules https://github.com/brianc/node-pg-copy-streams and https://github.com/brianc/node-pg-query-stream do not work with native bindings (you will have to require 'pg' to use them).

Thus, it is recommended you use either the pure JavaScript or native bindings in both development and production and don't mix & match them in the same process - it can get confusing!

## Features

* pure JavaScript client and native libpq bindings share _the same api_
* connection pooling
* extensible js<->postgresql data-type coercion
* supported PostgreSQL features
  * parameterized queries
  * named statements with query plan caching
  * async notifications with `LISTEN/NOTIFY`
  * bulk import & export with `COPY TO/COPY FROM`

## Extras

node-postgres is by design pretty light on abstractions.  These are some handy modules we've been using over the years to complete the picture.
Entire list can be found on [wiki](https://github.com/brianc/node-postgres/wiki/Extras)

## Contributing

__:heart: contributions!__

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

If you need help or run into _any_ issues getting node-postgres to work on your system please report a bug or contact me directly.  I am usually available via google-talk at my github account public email address.  Remember this is a labor of love, and though I try to get back to everything sometimes life takes priority, and I might take a while.  It helps if you use nice code formatting in your issue, search for existing answers before posting, and come back and close out the issue if you figure out a solution.  The easier you can make it for me, the quicker I'll try and respond to you!

If you need deeper support, have application specific questions, would like to sponsor development, or want consulting around node & postgres please send me an email, I'm always happy to discuss!

I usually tweet about any important status updates or changes to node-postgres on twitter.
Follow me [@briancarlson](https://twitter.com/briancarlson) to keep up to date.


## License

Copyright (c) 2010-2016 Brian Carlson (brian.m.carlson@gmail.com)

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

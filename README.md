#node-postgres

[![Build Status](https://secure.travis-ci.org/brianc/node-postgres.png)](http://travis-ci.org/brianc/node-postgres)

PostgreSQL client for node.js.  Pure JavaScript and native libpq bindings.

## Installation

    npm install pg
    
## Examples

### Callbacks

```javascript
var pg = require('pg'); 
//or native libpq bindings
//var pg = require('pg').native

var conString = "tcp://postgres:1234@localhost/postgres";

//note: error handling omitted
var client = new pg.Client(conString);
client.connect(function(err) {
  client.query('SELECT NOW() AS "theTime"', function(err, result) {
      console.log(result.rows[0].theTime);
      //output: Tue Jan 15 2013 19:12:47 GMT-600 (CST)
  })
});

```

### Events

```javascript
var pg = require('pg'); //native libpq bindings = `var pg = require('pg').native`
var conString = "tcp://postgres:1234@localhost/postgres";

var client = new pg.Client(conString);
client.connect();

//queries are queued and executed one after another once the connection becomes available
client.query("CREATE TEMP TABLE beatles(name varchar(10), height integer, birthday timestamptz)");
client.query("INSERT INTO beatles(name, height, birthday) values($1, $2, $3)", ['John', 68, new Date(1944, 10, 13)]);
var query = client.query("SELECT * FROM beatles WHERE name = $1", ['John']);

//can stream row results back 1 at a time
query.on('row', function(row) {
  console.log(row);
  console.log("Beatle name: %s", row.name); //Beatle name: John
  console.log("Beatle birth year: %d", row.birthday.getYear()); //dates are returned as javascript dates
  console.log("Beatle height: %d' %d\"", Math.floor(row.height/12), row.height%12); //integers are returned as javascript ints
});

//fired after last row is emitted
query.on('end', function() { 
  client.end();
});
```

### Example notes

node-postgres supports both an 'event emitter' style API and a 'callback' style.  The callback style is more concise and generally preferred, but the evented API can come in handy when you want to handle row events as they come in.  

They can be mixed and matched.  The only events which do __not__ fire when callbacks are supplied are the `error` events, as they are to be handled within the callback function.

All examples will work with the pure javascript bindings or the libpq native (c/c++) bindings

To use native libpq bindings replace `require('pg')` with `require('pg').native`.

The two share the same interface so __no other code changes should be required__.  If you find yourself having to change code other than the require statement when switching from `pg` to `pg.native`, please report an issue.

### Features

* pure javascript client and native libpq bindings share _the same api_
* row-by-row result streaming
* responsive project maintainer
* supported PostgreSQL features
  * parameterized queries
  * named statements with query plan caching
  * async notifications with `LISTEN/NOTIFY`
  * bulk import & export with `COPY TO/COPY FROM`
  * extensible js<->postgresql data-type coercion

## Documentation

Documentation is a work in progress primarily taking place on the github WIKI

### [Documentation](https://github.com/brianc/node-postgres/wiki)

### __PLEASE__ check out the WIKI

If you have a question, post it to the FAQ section of the WIKI so everyone can read the answer

## Production Use
* [yammer.com](http://www.yammer.com)
* [bayt.com](http://bayt.com)
* [bitfloor.com](https://bitfloor.com)
* [Vendly](http://www.vend.ly)
* [SaferAging](http://www.saferaging.com)

_if you use node-postgres in production and would like your site listed here, fork & add it_

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

I usually tweet about any important status updates or changes to node-postgres.  You can follow me [@briancarlson](https://twitter.com/briancarlson) to keep up to date.


## Extras

node-postgres is by design _low level_ with the bare minimum of abstraction.  These might help out:

- https://github.com/grncdr/node-any-db
- https://github.com/brianc/node-sql

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

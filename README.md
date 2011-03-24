#node-postgres

Non-blocking PostgreSQL client for node.js.  Pure JavaScript and native libpq bindings.

## Installation

    npm install pg

## Examples

All examples will work with the pure javascript bindings (currently default) or the libpq native (c/c++) bindings (currently in beta)

To use native libpq bindings replace `require('pg')` with `require('pg').native`.

The two share the same interface so __no other code changes should be required__.  If you find yourself having to change code other than the require statement when switching from `pg` to `pg.native`, please report an issue.

### Simple, using built-in client pool

    var pg = require('pg'); 
    //or native libpq bindings
    //var pg = require('pg').native

    var conString = "tcp://postgres:1234@localhost/postgres";

    //error handling omitted
    pg.connect(conString, function(err, client) {
      client.query("SELECT NOW() as when", function(err, result) {
        console.log("Row count: %d",result.rows.length);  // 1
        console.log("Current year: %d", result.rows[0].when.getYear());
      });
    });

### Evented api

    var pg = require('pg'); //native libpq bindings = `var pg = require('pg').native`
    var conString = "tcp://postgres:1234@localhost/postgres";
    
    var client = new pg.Client(conString);
    client.connect();

    //queries are queued and executed one after another once the connection becomes available
    client.query("CREATE TEMP TABLE beatles(name varchar(10), height integer, birthday timestamptz)");
    client.query("INSERT INTO beatles(name, height, birthday) values($1, $2, $3)", ['Ringo', 67, new Date(1945, 11, 2)]);
    client.query("INSERT INTO beatles(name, height, birthday) values($1, $2, $3)", ['John', 68, new Date(1944, 10, 13)]);

    //queries can be executed either via text/parameter values passed as individual arguments
    //or by passing an options object containing text, (optional) parameter values, and (optional) query name
    client.query({
      name: 'insert beatle',
      text: "INSERT INTO beatles(name, height, birthday) values($1, $2, $3)",
      values: ['George', 70, new Date(1946, 02, 14)]
    });

    //subsequent queries with the same name will be executed without re-parsing the query plan by postgres
    client.query({
      name: 'insert beatle',
      values: ['Paul', 63, new Date(1945, 04, 03)]
    });
    var query = client.query("SELECT * FROM beatles WHERE name = $1", ['john']);

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

### Info

* a pure javascript client and native libpq bindings with _the same api_
* _heavily_ tested
  * the same suite of 200+ integration tests passed by both javascript & libpq bindings
  * benchmark & long-running memory leak tests performed before releases
  * tested with with
    * postgres 8.x, 9.x
    * Linux, OS X
    * node 2.x, 3.x, & 4.x
* row-by-row result streaming
* optional, built-in connection pooling
* responsive project maintainer
* supported PostgreSQL features
  * parameterized queries
  * named statements with query plan caching
  * async notifications
  * extensible js<->postgresql data-type coercion 
* query queue
* active development
* fast
* No dependencies (other than PostgreSQL)
* No monkey patching
* Tried to mirror the node-mysql api as much as possible for future multi-database-supported ORM implementation ease

### Contributors

Many thanks to the following:

* [creationix](https://github.com/creationix)
* [felixge](https://github.com/felixge)
* [pshc](https://github.com/pshc)
* [pjornblomqvist](https://github.com/bjornblomqvist)
* [JulianBirch](https://github.com/JulianBirch)

## Documentation

Still a work in progress, I am trying to flesh out the wiki...

### [Documentation](node-postgres/wiki)

### __PLEASE__ check out the WIKI

## Help

If you need help or run into _any_ issues getting node-postgres to work on your system please report a bug or contact me directly.  I am usually available via google-talk at my github account public email address.
    
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




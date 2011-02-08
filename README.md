#node-postgres

Non-blocking (async) pure JavaScript PostgreSQL client for node.js written
with love and TDD.

## Installation

    npm install pg

## Example

    var pg = require('pg');
    var connectionString = "pg://user:password@host:port/database";
    pg.connect(connectionString, function(err, client) {
      if(err) {
        //handle connection error
      }
      else {
        //queries are queued and executed in order
        client.query("CREATE TEMP TABLE user(name varchar(50), birthday timestamptz)");
        client.query("INSERT INTO user(name, birthday) VALUES('brianc', '1982-01-01T10:21:11')");
        
        //parameterized queries with transparent type coercion
        client.query("INSERT INTO user(name, birthday) VALUES($1, $2)", ['santa', new Date()]);
        
        //nested queries with callbacks
        client.query("SELECT * FROM user ORDER BY name", function(err, result) {
          if(err) {
            //handle query error
          }
          else {
            client.query("SELECT birthday FROM user WHERE name = $1", [result.rows[0].name], function(err, result) {
              //typed parameters and results
              assert.ok(result.rows[0].birthday.getYear() === 1982)
            })
          }
        })
      }
    }

## Philosophy

* well tested
* no monkey patching
* no dependencies (...besides PostgreSQL)
* [in-depth documentation](http://github.com/brianc/node-postgres/wiki) (work in progress)

## features

- prepared statement support
  - parameters
  - query caching
- type coercion
  - date <-> timestamptz
  - integer <-> integer, smallint, bigint
  - float <-> double, numeric
  - boolean <-> boolean
- notification message support
- connection pooling
- mucho testing
  ~250 tests executed on
    - ubuntu
      - node v0.2.2, v0.2.3, v0.2.4, v0.2.5, v0.2.6, v0.3.0, v0.3.1, v0.3.2, v0.3.3, v0.3.4, v0.3.5, v0.3.6, v0.3.6, v0.3.8
      - postgres 8.4.4
    - osx
      - node v0.2.2, v0.2.3, v0.2.4, v0.2.5, v0.2.6, v0.3.0, v0.3.1, v0.3.2, v0.3.3, v0.3.4, v0.3.5, v0.3.6, v0.3.6, v0.3.8
      - postgres v8.4.4, v9.0.1 installed both locally and on networked Windows 7

## Contributing

clone the repo:

     git clone git://github.com/brianc/node-postgres
     cd node-postgres
     make test

And just like magic, you're ready to contribute! <3

### Contributors

Many thanks to the following:

* [creationix](https://github.com/creationix)
* [felixge](https://github.com/felixge)
* [pshc](https://github.com/pshc)
* [pjornblomqvist](https://github.com/bjornblomqvist)
* [JulianBirch](https://github.com/JulianBirch)

## More info please

### [Documentation](node-postgres/wiki)

### __PLEASE__ check out the WIKI

## Help

If you need help or run into _any_ issues getting node-postgres to work on your system please report a bug or contact me directly.
    
### Working?

[this page](http://www.explodemy.com) is running the worlds worst (but fully functional) PostgreSQL backed, Node.js powered website.

### Why did you write this?

As soon as I saw node.js for the first time I knew I had found something lovely and simple and _just what I always wanted!_.  So...I poked around for a while.  I was excited.  I still am!

I drew major inspiration from [postgres-js](http://github.com/creationix/postgres-js).

I also drew some major inspirrado from
[node-mysql](http://github.com/felixge/node-mysql) and liked what I
saw there.

### Plans for the future?

- transparent prepared statement caching
- more testings of error scenarios

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




#node-postgres

Non-blocking PostgreSQL client for node.js
* a pure javascript client and native libpq bindings with _the same api_
* _heavily_ tested
  * the same suite of 200+ integration tests passed by both javascript & libpq bindings
  * benchmark & long-running memory leak tests performed before releases
  * tested with with
    * postgres 8.x, 9.x
    * Linux, OS X
    * node 2.x, 3.x, & 4.x
* active development
* _very_ fast
* row-by-row result streaming
* optional, built-in connection pooling
* responsive project maintainer
* supported PostgreSQL features
  * parameterized queries
  * named statements with query plan caching
  * async notifications
  * extensible js<->postgresql data-type coercion 
* No dependencies (other than PostgreSQL)
* No monkey patching

## Installation

    npm install pg

## Example
```javascript
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
```
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




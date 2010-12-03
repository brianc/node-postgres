#node-postgres

Non-blocking (async) pure JavaScript PostgreSQL client for node.js written
with love and TDD.

## alpha version

### Installation

    npm install pg

### Example

    var pg = require('pg');
    
    pg.connect("pg://user:password@host:port/database", function(err, client) {
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
    
### Philosophy

* well tested
* no monkey patching
* no dependencies (...besides PostgreSQL)
* [in-depth documentation](http://github.com/brianc/node-postgres/wiki)

### features

- prepared statement support
  - parameters
  - query caching
- type coercion
  - date <-> timestamptz
  - integer <-> integer, smallint, bigint
  - float <-> double, numeric
  - boolean <-> boolean
- notification message support
- tested like a Toyota
  ~1000 assertions executed on
    - ubuntu
      - node v0.2.2, v0.2.3, v0.2.4, v0.2.5, v0.3.0, v0.3.1
      - postgres 8.4.4
    - osx
      - node v0.2.2, v0.2.3, v0.2.4, v0.2.5, v0.3.0, v0.3.1
      - postgres v8.4.4, v9.0.1 installed both locally and on networked Windows 7

### Contributing

clone the repo:

     git clone git://github.com/brianc/node-postgres
     cd node-postgres
     node test/run.js

And just like magic, you're ready to contribute! <3

## More info please

### Documentation

__PLEASE__ check out the [WIKI](node-postgres/wiki).  __MUCH__ more information there.

### Working?

[this page](http://www.explodemy.com) is running the worlds worst (but fully functional) PostgreSQL backed, Node.js powered website.

### Why did you write this?

As soon as I saw node.js for the first time I knew I had found
something lovely and simple and _just what I always wanted!_.  So...I
poked around for a while.  I was excited.  I still am!

I drew major inspiration from [postgres-js](http://github.com/creationix/postgres-js).

I also drew some major inspirrado from
[node-mysql](http://github.com/felixge/node-mysql) and liked what I
saw there.

### Plans for the future?

- transparent prepared statement caching
- connection pooling
- more testings of error scenarios

## License

node-postgres is licensed under the [MIT license](node-postgres/blob/master/License).

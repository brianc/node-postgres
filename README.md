#pg.js
Async Pure JavaScript PostgreSQL driver for node.js

## ALPHA version

Implemented in a fully TDD fashion.  Drew major inspiration from
[postgres-js](http://github.com/creationix/postgres-js) but it has 0 tests and
doesn't seem to be actively developed anymore.  I'm aiming for
extremely high quality code, but first doing the implementation and
only refactoring after tests are in place.  

I'm first aiming to support the low level [messaging
protocol](http://developer.postgresql.org/pgdocs/postgres/protocol.html).

Due to the fully async nature of node sockets, the driver is
completely non-blocking.

### What works?

    var client = new Client({
      username: 'brianc',
      database: 'postgres'
    });

    client.connect();
    
    client.query('select typname, oid from pg_type');

    query.on('row', function(row) {
      console.log('type name: ' + row[0] + ' oid: ' + row[1]);      
    };

    query.on('end') {
      client.end();
    };


## TODO
  - prepared statements
    - parameters
    - caching
  - portals
  - integration testing
  - notification api
  - setting parameters
  - connection pooling
  - copy data
  - connection pooling

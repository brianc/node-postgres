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
completely non-blocking. Jump for joy!

### Connection

The connection object is a 1 to 1 mapping to the [messaging
protocol](http://developer.postgresql.org/pgdocs/postgres/protocol.html).
It is mostly used by the Client object (which...I haven't yet
implemented) but you can do anything you want with PostgreSQL using
the connection object if you're really into that.  I studied the
protocol for a while implementing this and the documentation is pretty
solid.  The connection only supports 'text' mode right now.

### Client

Basically a facade on top of the connection to provide a much more
user friendly, "node style" interface for doing all the lovely things
you like with PostgreSQL.

## TODO
  - prepared statements
    - parameters
    - caching
  - integration testing
  - notifications
  - setting parameters
  - connection pooling
  - copy data
  - connection pooling

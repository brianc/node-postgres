#node-postgres

100% javascript. 100% async. 100% would love your contributions.

## Why?

As soon as I saw node.js for the first time I knew I had found
something lovely and simple and _just what I always wanted!_.  So...I
poked around for a while.  I looked at the various NoSQL solutions but
I still thought having support an actual database founded on decades of PhD
level research might be something nice to have?  

I drew major inspiration from
[postgres-js](http://github.com/creationix/postgres-js).  I didn't
just fork and contribute because it has
__0__ tests included with it and doesn't seem to be actively developed
anymore.  I am not comfortable forking & playing with a project
without having a way to run a test suite, let alone using it in production.

So...__boom__ I set out to write my own.  I'm not working on anything
else in my spare time other than this.  It's a labor of love.  I'd
love for you to love it as well and contribute.  Fork, patch, and send
me a pull request.  All I ask is everything you add you have complete
and possible obsessive test coverage to back up.  

## ALPHA version

Implemented in a fully TDD fashion.    I'm aiming for
extremely high quality code, but first doing the implementation and
only refactoring after tests are in place.  

### Connection

The connection object is a 1 to 1 mapping to the [messaging
protocol](http://developer.postgresql.org/pgdocs/postgres/protocol.html).
It is mostly used by the Client object (which...I haven't yet
finished implementing) but you can do anything you want with PostgreSQL using
the connection object if you're really into that.  I studied the
protocol for a while implementing this and the documentation is pretty
solid.  

There are a few minor variations from the protocol:

- The connection only supports 'text' mode right now.
- Renamed 'passwordMessage' to 'password'
- Renamed 'startupMessage' to 'startup'
- Renamed 'errorResposne' to 'error'
- Renamed 'noticeResponce' to 'notice'

The reason for the renamings is 90% of the message names in the
protocol do no contain "message" "request" "response" or anything
similar, and I feel it's a bit redundant to send a "passwordMessage
message."  But then again...I do say ATM machine.

Anyways...using a connection directly is a pretty verbose and
cumbersom affair.  Here's an example of executing a prepared query
using the directly __Connection__ api in compliance with
PostgreSQL.
 
_note: this works and is taken directly from an integration test;
however, it doesn't even include error handling_

    var con = new Connection({stream: new net.Stream()});

    con.connect('5432','localhost');

    con.once('connect', function() {

      con.startup({
        user: username,
        database: database
      });

      con.once('readyForQuery', function() {

        con.query('create temp table ids(id integer)');

        con.once('readyForQuery', function() {

          con.query('insert into ids(id) values(1); insert into ids(id) values(2);');

          con.once('readyForQuery', function() {

            con.parse({
              text: 'select * from ids'
            });
            con.flush();

            con.once('parseComplete', function() {
              con.bind();
              con.flush();
            });

            con.once('bindComplete', function() {
              con.execute();
              con.flush();
            });

            con.once('commandComplete', function() {
              con.sync();
            });

            con.once('readyForQuery', function() {
              con.end();
            });
          });
        });
      });
    });


### Client

Basically a facade on top of the connection to provide a _much_ more
user friendly, "node style" interface for doing all the lovely things
you like with PostgreSQL.

Now that I've got the __Connection__ api in place, the bulk and meat of
the work is being done on the __Client__ to provide the best possible
API.  Help? Yes please!

What I'd like is to simplify the above low level use with something
like this:

_note: this doesn't even __exist__ yet_
    var client = new Client({
      user: 'brian',
      database: 'postgres',
    });

    client.query("create temp table ids(id integer)");
    client.query("insert into ids(id) values(1)");
    client.query("insert into ids(id) values(2)");
    var query = client.query("select * from ids", function(row) {
      row.fields[0] // <- that equals 1 the first time. 2 the second time.
    });
    query.on('end', function() {
      client.end();
    });    

## TODO
  - Error handling
  - integration testing
  - notificationp
  - setting parameters
  - connection pooling
  - copy data
  - connection pooling

#node-postgres

100% javascript. 100% async. 100% would love your contributions.

## ALPHA version

Implemented in a fully TDD fashion.    I'm aiming for
extremely high quality code, but first doing the implementation and
only refactoring after tests are in place.  

### Connection

The connection object is a 1 to 1 mapping to the [postgres
client/server messaging protocol](http://developer.postgresql.org/pgdocs/postgres/protocol.html).
The __Connection_ object is mostly used by the Client object (which...I haven't yet
finished implementing) but you can do anything you want with PostgreSQL using
the connection object if you're really into that.  I studied the
protocol for a while implementing this and the documentation is pretty
solid.  If you're already familiar you should be right at home.  Have
fun looking up the [oids for the datatypes in your bound queries](http://github.com/brianc/node-postgres/blob/master/script/list-db-types.js)

There are a few minor variations from the protocol:

- The connection only supports 'text' mode right now.
- Renamed 'passwordMessage' to 'password'
- Renamed 'startupMessage' to 'startup'
- Renamed 'errorResposne' to 'error'
- Renamed 'noticeResponce' to 'notice'

The reason for the renamings is 90% of the message names in the
protocol do no contain "message" "request" "response" or anything
similar, and I feel it's a bit redundant to send a "passwordMessage
message."  But then again...[I do say ATM machine](http://en.wikipedia.org/wiki/RAS_syndrome).

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

_note: this doesn't fully exist yet_

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

## Testing

The tests are split up into two different Unit test and
integration tests.  

### Unit tests

Unit tests do not depend on having access to a
running PostgreSQL server.  They work by mocking out the `net.Stream`
instance into a `MemoryStream`.  The memory stream raises 'data'
events with pre-populated packets which simulate communcation from an
actual PostgreSQL server.  Some tests will validate incomming packets
are parsed correctly by the __Connection__ and some tests validate the
__Connection__ correctly sends outgoing packets to the stream.

### Integration tests

The integration tests operate on an actual database and require
access.  They're under a bit more flux as the api for the client is
changing a bit; however, they should always all be passing on every
push up to the ol' githubber.
### Running tests

You can run any test file directly by doing the `node
test/unit/connection/inbound-parser-tests.js` or something of the
like.  

However, you can specify command line arguments after the file
and they will be picked up and used in the tests.  None of the
arguments are used in _unit_ tests, so you're safe to just blast away
with the command like above, but if you'd like to execute an
_integration_ test, you outta specifiy your database, user to use for
testing, and optionally a password.

To do so you would do something like so:

    node test/integration/client/simple-query-tests.js -u brian -d test_db 

If you'd like to execute all the unit or integration tests at one
time, you can do so with the "run.js" script in the /test directory as
follows:

##### Run all unit tests

    node test/run.js -t unit

or optionally, since `-t unit` is the default

    node test/run.js

##### Run all integration tests

    node test/run.js -t integration -u brian -d test_db --password password!

##### Run all the tests!

    node test/run.js -t all -u brian -d test_db --password password!

In short, I tried to make executing the tests as easy as possible.
Hopefully this will encourage you to fork, hack, and do whatever you
please as you've got a nice, big safety net under you.

#### Test data

In order for the integration tests to not take ages to run, I've
pulled out the script used to generate test data.  This way you can
generate a "test" database once and don't have to up/down the tables
every time an integration test runs.  To run the generation script,
execute the script with the same command line arguments passed to any
other test script.

    node script/create-test-tables.js -u user -d database

Aditionally if you want to revert the test data, you'll need to "down"
the database first and then re-create the data as follows:


    node script/create-test-tables.js -u user -d database --down
    node script/create-test-tables.js -u user -d database

## TODO
  - Query results returned
    - some way to return number of rows inserted/updated etc
    (supported in protocol and handled in __Connection__ but not sure
    where on the __Client__ api to add this functionality)
  - Typed result set support in client
    - simple queries
    - bound commands
    - edge cases
      - [numeric 'NaN' result](http://www.postgresql.org/docs/8.4/static/datatype-numeric.html)
      - float Infinity, -Infinity
  - Error handling
    - disconnection, removal of listeners on errors
    - passing errors to callbacks?
  - more integration testing
  - bound command support in client
    - type specification
    - parameter specification
    - transparent bound command caching?
    - nice "cursor" (portal) api
  - connection pooling
  - copy data?
  - kiss the sky

## Why?

As soon as I saw node.js for the first time I knew I had found
something lovely and simple and _just what I always wanted!_.  So...I
poked around for a while.  I was excited.  I told my friend "ah man
the only thing holding node back is a really solid data access story."
I mean...let's put the NoSQL debate aside.  Let's say for arguments
sake you have to run a query from node.js on PostgreSQL before the
last petal falls off the rose and you are stuck as a beast forever?
What if your entire production site depends on it?  Well, fret no
more.  And let [GastonDB](http://www.snipetts.com/ashley/mymusicals/disney/beauty-an-beast/images/gaston.gif) be vanquished.

I drew major inspiration from
[postgres-js](http://github.com/creationix/postgres-js).  I didn't
just fork and contribute because it has
__0__ tests included with it and doesn't seem to be actively developed
anymore.  I am not comfortable forking & playing with a project
without having a way to run a test suite, let alone using it in
production.

I also drew some major inspirrado from
[node-mysql](http://github.com/felixge/node-mysql) and liked what I
saw there.  I'm thinking I might be stealing some of the ideas there
for the __Client__ api.

So...__boom__. I set out to write my own.  I'm not working on anything
else in my spare time other than this.  It's a labor of love.  I'd
love for you to love it as well.  Contribute.  Fork, patch, and send
me a pull request.  All I ask is everything you add you have complete
and possibly obsessive test coverage to back up.  

## License

node-postgres is licensed under the MIT license.

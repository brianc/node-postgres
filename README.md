#node-postgres

Non-blocking (async) JavaScript PostgreSQL client for node.js written fully TDD

## alpha version

### Whirlwind tour

    var Client = require('node-postgres').Client;
    var client = new Client({
      user: 'brianc',
      database: 'test',
      password: 'boom' //plaintext or md5 supported
    });

    client.connect();

    var printRow = function(row) {
      console.log(row.fields);
    };

    var simpleQuery = client.query("select * from user where heart = 'big'");
    simpleQuery.on('row', printRow);

    var preparedStatement = client.query({
      name: 'user by heart type',
      text: 'select * from user where heart = $1',
      values: ['big']
    });
    preparedStatement.on('row', printRow);

    var cachedPreparedStatement = client.query({
      name: 'user by heart type',
      values: ['filled with kisses']
    });
    cachedPreparedStatement.on('row', printRow);

    cachedPreparedStatement.on('end', client.end());

### Philosophy

* well tested
* no monkey patching
* no dependencies (well...besides PostgreSQL)

### Installation

Clone the repo.  

     git clone git://github.com/brianc/node-postgres
     cd node-postgres
     node test/run.js

And just like magic, you're ready to contribute! <3

## More info please

Srsly check out the [[wiki]].  MUCH more information there.

p.s. want your own offline version of the wiki?

    git clone git://github.com/brianc/node-postgres.wiki.git

__github is magic__

### Why?

As soon as I saw node.js for the first time I knew I had found
something lovely and simple and _just what I always wanted!_.  So...I
poked around for a while.  I was excited.  I still am!

Let's say for arguments sake you have to run a query from node.js on PostgreSQL before the
last petal falls off the rose and you are stuck as a beast forever?
You can't use NoSQL because your boss said he'd pour a cup of
Hoegarten into your laptop fan vent and you _hate_ that beer?
What if your entire production site depends on it?  Well, fret no
more.  And let [GastonDB](http://www.snipetts.com/ashley/mymusicals/disney/beauty-an-beast/images/gaston.gif) be vanquished.

I drew major inspiration from
[postgres-js](http://github.com/creationix/postgres-js).  I didn't
just fork and contribute because it has
_0_ tests included with it, adds a bunch of methods to the Buffer()
object, and doesn't seem to be maintained.  Still...was a lovely way
to learn & excellent reference material.

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

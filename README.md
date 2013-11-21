node-pg-cursor
==============

Use a PostgreSQL result cursor from node with an easy to use API.

### why?

Sometimes you need to itterate through a table in chunks.  It's extremely inefficient to use hand-crafted `LIMIT` and `OFFSET` queries to do this.
PostgreSQL provides built-in functionality to fetch a "cursor" to your results and page through the cursor efficiently fetching chunks of the results with full MVCC compliance.  

This actually ends up pairing very nicely with node's _asyncness_ and handling a lot of data.  PostgreSQL is rad.

### example

```js
var Cursor = require('pg-cursor')
var pg = require('pg')

pg.connect(function(err, client, done) {

  //imagine some_table has 30,000,000 results where prop > 100
  //lets create a query cursor to efficiently deal with the huge result set
  var cursor = client.query(new Cursor('SELECT * FROM some_table WHERE prop > $1', [100]))
  
  //read the first 100 rows from this cursor
  cursor.read(100, function(err, rows) {
    if(err) {
      //cursor error - release the client
      //normally you'd do app-specific error handling here
      return done(err)
    }
    
    //when the cursor is exhausted and all rows have been returned
    //all future calls to `cursor#read` will return an empty row array
    //so if we received no rows, release the client and be done
    if(!rows.length) return done()
    
    //do something with your rows
    //when you're ready, read another chunk from
    //your result
    
    
    cursor.read(2000, function(err, rows) {
      //I think you get the picture, yeah?
      //if you dont...open an issue - I'd love to help you out!
      
      //Also - you probably want to use some sort of async or promise library to deal with paging
      //through your cursor results.  node-pg-cursor makes no asumptions for you on that front.
    })
  })
});
```

### api

#### var Cursor = require('pg-cursor')

#### constructor Cursor(string queryText, array queryParameters)

Creates an instance of a query cursor.  Pass this instance to node-postgres [`client#query`](https://github.com/brianc/node-postgres/wiki/Client#wiki-method-query-parameterized)

#### cursor#read(int rowCount, function callback(Error err, Array rows)

Read `rowCount` rows from the cursor instance.  The `callback` will be called when the rows are available, loaded into memory, parsed, and converted to JavaScript types.

If the cursor has read to the end of the result sets all subsequent calls to `cursor#read` will return a 0 length array of rows.  I'm open to other ways to signal the end of a cursor, but this has worked out well for me so far.

### install

```sh
$ npm install pg-cursor
```
___note___: this depends on _either_ `npm install pg` or `npm install pg.js`, but you __must__ be using the pure JavaScript client.  This will __not work__ with the native bindings.

### license

The MIT License (MIT)

Copyright (c) 2013 Brian M. Carlson

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

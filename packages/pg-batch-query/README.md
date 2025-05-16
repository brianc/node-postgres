# pg-batch-query

Batches queries by using the [Extended query protocol](https://www.postgresql.org/docs/current/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY).
Essentially we do the following
- send a single PARSE command to create a named statement.
- send a pair of BIND and EXECUTE commands
- Finally send a SYNC to close the current transaction.

As [per benchmark tests](./bench.ts), number of queries per seconds gets tripled using batched queries.

## installation

```bash
$ npm install pg --save
$ npm install pg-batch-query --save
```

## use

```js
const pg = require('pg')
var pool = new pg.Pool()
const BatchQuery = require('pg-batch-query')

const batch = new BatchQuery({
  name: 'optional',
  text: 'SELECT from foo where bar = $1',
  values: [
    ['first'],
    ['second']
  ]
})

pool.connect((err, client, done) => {
  if (err) throw err
  const result = client.query(batch).execute()
  for (const res of result) {
    for (const row of res) {
      console.log(row)
    }
  }
})
```

## contribution

I'm very open to contribution! Open a pull request with your code or idea and we'll talk about it. If it's not way insane we'll merge it in too: isn't open source awesome?

## license

The MIT License (MIT)

Copyright (c) 2013-2020 Ankush Chadda

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

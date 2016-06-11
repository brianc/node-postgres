# pg-pool
A connection pool for node-postgres

## install
```sh
npm i pg-pool pg
```

## use

### create

to use pg-pool you must first create an instance of a pool

```js
const Pool = require('pg-pool')

//by default the pool uses the same
//configuration as whatever `pg` version you have installed
const pool = new Pool()

//you can pass properties to the pool
//these properties are passed unchanged to both the node-postgres Client constructor
//and the node-pool (https://github.com/coopernurse/node-pool) constructor
//allowing you to fully configure the behavior of both
const pool2 = new Pool({
  database: 'postgres',
  user: 'brianc',
  password: 'secret!',
  port: 5432,
  ssl: true,
  max: 20, //set pool max size to 20
  min: 4, //set min pool size to 4
  idleTimeoutMillis: 1000 //close idle clients after 1 second
})

//you can supply a custom client constructor
//if you want to use the native postgres client
const NativeClient = require('pg').native.Client
const nativePool = new Pool({ Client: NativeClient })

//you can even pool pg-native clients directly
const PgNativeClient = require('pg-native')
const pgNativePool = new Pool({ Client: PgNativeClient })
```

### acquire clients with a promise

pg-pool supports a fully promise-based api for acquiring clients

```js
const pool = new Pool()
pool.connect().then(client => {
  client.query('select $1::text as name', ['pg-pool']).then(res => {
    client.release()
    console.log('hello from', res.rows[0].name)
  })
  .catch(e => {
    client.release()
    console.error('query error', e.message, e.stack)
  })
})
```

### plays nice with async/await

this ends up looking much nicer if you're using [co](https://github.com/tj/co) or async/await:

```js
const pool = new Pool()
const client = await pool.connect()
try {
  const result = await client.query('select $1::text as name', ['brianc'])
  console.log('hello from', result.rows[0])
} finally {
  client.release()
}
```

### your new favorite helper method

because its so common to just run a query and return the client to the pool afterward pg-pool has this built-in:

```js
const pool = new Pool()
const time = await pool.query('SELECT NOW()')
const name = await pool.query('select $1::text as name', ['brianc'])
console.log(name.rows[0].name, 'says hello at', time.rows[0].name)
```
__pro tip:__ unless you need to run a transaction (which requires a single client for multiple queries) or you
have some other edge case like [streaming rows](https://github.com/brianc/node-pg-query-stream) or using a [cursor](https://github.com/brianc/node-pg-cursor)
you should almost always just use `pool.query`.  Its easy, it does the right thing :tm:, and wont ever forget to return
clients back to the pool after the query is done.

### drop-in backwards compatible

pg-pool still and will always support the traditional callback api for acquiring a client.  This is the exact API node-postgres has shipped with internally for years:

```js
const pool = new Pool()
pool.connect((err, client, done) => {
  if (err) return done(err)

  client.query('SELECT $1::text as name', ['pg-pool'], (err, res) => {
    done()
    if (err) {
      return console.error('query error', e.message, e.stack)
    }
    console.log('hello from', res.rows[0].name)
  })
})
```

That means you can drop pg-pool into your app and 99% of the cases you wont even notice a difference.  In fact, very soon I will be using pg-pool internally within node-postgres itself!

### shut it down

When you are finished with the pool if all the clients are idle the pool will close them after `config.idleTimeoutMillis` and your app
will shutdown gracefully.  If you don't want to wait for the timeout you can end the pool as follows:

```js
const pool = new Pool()
const client = await pool.connect()
console.log(await client.query('select now()'))
client.release()
await pool.end()
```

## tests

To run tests clone the repo, `npm i` in the working dir, and then run `npm test`

## contributions

I love contributions.  Please make sure they have tests, and submit a PR.  If you're not sure if the issue is worth it or will be accepted it never hurts to open an issue to begin the conversation.  Don't forget to follow me on twitter at [@briancarlson](https://twitter.com/briancarlson) - I generally announce any noteworthy updates there.

## license

The MIT License (MIT)
Copyright (c) 2016 Brian M. Carlson

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

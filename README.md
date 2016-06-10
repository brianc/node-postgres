# pg-pool
A connection pool for node-postgres

## install
```sh
npm i pg-pool pg
```

## use

to use pg-pool you must first create an instance of a pool

```js
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

pg-pool supports the traditional callback api for acquiring a client that node-postgres has shipped with internally for years:

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

## license

The MIT License (MIT)
Copyright (c) 2016 Brian M. Carlson

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

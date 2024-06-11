---
title: Upgrading
slug: /guides/upgrading
---

# Upgrading to 8.0

node-postgres at 8.0 introduces a breaking change to ssl-verified connections. If you connect with ssl and use

```
const client = new Client({ ssl: true })
```

and the server's SSL certificate is self-signed, connections will fail as of node-postgres 8.0. To keep the existing behavior, modify the invocation to

```
const client = new Client({ ssl: { rejectUnauthorized: false } })
```

The rest of the changes are relatively minor and unlikely to cause issues; see [the announcement](/announcements#2020-02-25) for full details.

# Upgrading to 7.0

node-postgres at 7.0 introduces somewhat significant breaking changes to the public API.

## node version support

Starting with `pg@7.0` the earliest version of node supported will be `node@4.x LTS`. Support for `node@0.12.x` and `node@.10.x` is dropped, and the module wont work as it relies on new es6 features not available in older versions of node.

## pg singleton

In the past there was a singleton pool manager attached to the root `pg` object in the package. This singleton could be used to provision connection pools automatically by calling `pg.connect`. This API caused a lot of confusion for users. It also introduced a opaque module-managed singleton which was difficult to reason about, debug, error-prone, and inflexible. Starting in pg@6.0 the methods' documentation was removed, and starting in pg@6.3 the methods were deprecated with a warning message.

If your application still relies on these they will be _gone_ in `pg@7.0`. In order to migrate you can do the following:

```js
// old way, deprecated in 6.3.0:

// connection using global singleton
pg.connect(function (err, client, done) {
  client.query(/* etc, etc */)
  done()
})

// singleton pool shutdown
pg.end()

// ------------------

// new way, available since 6.0.0:

// create a pool
var pool = new pg.Pool()

// connection using created pool
pool.connect(function (err, client, done) {
  client.query(/* etc, etc */)
  done()
})

// pool shutdown
pool.end()
```

node-postgres ships with a built-in pool object provided by [pg-pool](https://github.com/brianc/node-pg-pool) which is already used internally by the `pg.connect` and `pg.end` methods. Migrating to a user-managed pool (or set of pools) allows you to more directly control their set up their life-cycle.

## client.query(...).on

Before `pg@7.0` the `client.query` method would _always_ return an instance of a query. The query instance was an event emitter, accepted a callback, and was also a promise. A few problems...

- too many flow control options on a single object was confusing
- event emitter `.on('error')` does not mix well with promise `.catch`
- the `row` event was a common source of errors: it looks like a stream but has no support for back-pressure, misleading users into trying to pipe results or handling them in the event emitter for a desired performance gain.
- error handling with a `.done` and `.error` emitter pair for every query is cumbersome and returning the emitter from `client.query` indicated this sort of pattern may be encouraged: it is not.

Starting with `pg@7.0` the return value `client.query` will be dependent on what you pass to the method: I think this aligns more with how most node libraries handle the callback/promise combo, and I hope it will make the "just works" :tm: feeling better while reducing surface area and surprises around event emitter / callback combos.

### client.query with a callback

```js
const query = client.query('SELECT NOW()', (err, res) => {
  /* etc, etc */
})
assert(query === undefined) // true
```

If you pass a callback to the method `client.query` will return `undefined`. This limits flow control to the callback which is in-line with almost all of node's core APIs.

### client.query without a callback

```js
const query = client.query('SELECT NOW()')
assert(query instanceof Promise) // true
assert(query.on === undefined) // true
query.then((res) => /* etc, etc */)
```

If you do **not** pass a callback `client.query` will return an instance of a `Promise`. This will **not** be a query instance and will not be an event emitter. This is in line with how most promise-based APIs work in node.

### client.query(Submittable)

`client.query` has always accepted any object that has a `.submit` method on it. In this scenario the client calls `.submit` on the object, delegating execution responsibility to it. In this situation the client also **returns the instance it was passed**. This is how [pg-cursor](https://github.com/brianc/node-pg-cursor) and [pg-query-stream](https://github.com/brianc/node-pg-query-stream) work. So, if you need the event emitter functionality on your queries for some reason, it is still possible because `Query` is an instance of `Submittable`:

```js
import pg from 'pg'
const { Client, Query } = pg
const query = client.query(new Query('SELECT NOW()'))
query.on('row', (row) => {})
query.on('end', (res) => {})
query.on('error', (res) => {})
```

`Query` is considered a public, documented part of the API of node-postgres and this form will be supported indefinitely.

_note: I have been building apps with node-postgres for almost 7 years. In that time I have never used the event emitter API as the primary way to execute queries. I used to use callbacks and now I use async/await. If you need to stream results I highly recommend you use [pg-cursor](https://github.com/brianc/node-pg-cursor) or [pg-query-stream](https://github.com/brianc/node-pg-query-stream) and **not** the query object as an event emitter._

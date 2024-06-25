---
title: Suggested Project Structure
---

Whenever I am writing a project & using node-postgres I like to create a file within it and make all interactions with the database go through this file. This serves a few purposes:

- Allows my project to adjust to any changes to the node-postgres API without having to trace down all the places I directly use node-postgres in my application.
- Allows me to have a single place to put logging and diagnostics around my database.
- Allows me to make custom extensions to my database access code & share it throughout the project.
- Allows a single place to bootstrap & configure the database.

## example

The location doesn't really matter - I've found it usually ends up being somewhat app specific and in line with whatever folder structure conventions you're using. For this example I'll use an express app structured like so:

```
- app.js
- index.js
- routes/
  - index.js
  - photos.js
  - user.js
- db/
  - index.js <--- this is where I put data access code
```

Typically I'll start out my `db/index.js` file like so:

```js
import pg from 'pg'
const { Pool } = pg

const pool = new Pool()

export const query = (text, params, callback) => {
  return pool.query(text, params, callback)
}
```

That's it. But now everywhere else in my application instead of requiring `pg` directly, I'll require this file. Here's an example of a route within `routes/user.js`:

```js
// notice here I'm requiring my database adapter file
// and not requiring node-postgres directly
import * as db from '../db/index.js'

app.get('/:id', async (req, res, next) => {
  const result = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id])
  res.send(result.rows[0])
})

// ... many other routes in this file
```

Imagine we have lots of routes scattered throughout many files under our `routes/` directory. We now want to go back and log every single query that's executed, how long it took, and the number of rows it returned. If we had required node-postgres directly in every route file we'd have to go edit every single route - that would take forever & be really error prone! But thankfully we put our data access into `db/index.js`. Let's go add some logging:

```js
import pg from 'pg'
const { Pool } = pg

const pool = new Pool()

export const query = async (text, params) => {
  const start = Date.now()
  const res = await pool.query(text, params)
  const duration = Date.now() - start
  console.log('executed query', { text, duration, rows: res.rowCount })
  return res
}
```

That was pretty quick! And now all of our queries everywhere in our application are being logged.

_note: I didn't log the query parameters. Depending on your application you might be storing encrypted passwords or other sensitive information in your database. If you log your query parameters you might accidentally log sensitive information. Every app is different though so do what suits you best!_

Now what if we need to check out a client from the pool to run several queries in a row in a transaction? We can add another method to our `db/index.js` file when we need to do this:

```js
import pg from 'pg'
const { Pool } = pg

const pool = new Pool()

export const query = async (text, params) => {
  const start = Date.now()
  const res = await pool.query(text, params)
  const duration = Date.now() - start
  console.log('executed query', { text, duration, rows: res.rowCount })
  return res
}

export const getClient = () => {
  return pool.connect()
}
```

Okay. Great - the simplest thing that could possibly work. It seems like one of our routes that checks out a client to run a transaction is forgetting to call `release` in some situation! Oh no! We are leaking a client & have hundreds of these routes to go audit. Good thing we have all our client access going through this single file. Lets add some deeper diagnostic information here to help us track down where the client leak is happening.

```js
export const query = async (text, params) => {
  const start = Date.now()
  const res = await pool.query(text, params)
  const duration = Date.now() - start
  console.log('executed query', { text, duration, rows: res.rowCount })
  return res
}

export const getClient = async () => {
  const client = await pool.connect()
  const query = client.query
  const release = client.release
  // set a timeout of 5 seconds, after which we will log this client's last query
  const timeout = setTimeout(() => {
    console.error('A client has been checked out for more than 5 seconds!')
    console.error(`The last executed query on this client was: ${client.lastQuery}`)
  }, 5000)
  // monkey patch the query method to keep track of the last query executed
  client.query = (...args) => {
    client.lastQuery = args
    return query.apply(client, args)
  }
  client.release = () => {
    // clear our timeout
    clearTimeout(timeout)
    // set the methods back to their old un-monkey-patched version
    client.query = query
    client.release = release
    return release.apply(client)
  }
  return client
}
```

That should hopefully give us enough diagnostic information to track down any leaks.

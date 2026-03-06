---
title: Using .pgpass
---

PostgreSQL supports a [.pgpass](https://www.postgresql.org/docs/current/libpq-pgpass.html) file for storing passwords. The file is located at `~/.pgpass` on Unix systems and `%APPDATA%\postgresql\pgpass.conf` on Windows. Each line in the file has the format:

```
hostname:port:database:username:password
```

You can use the [pgpass](https://www.npmjs.com/package/pgpass) module together with the `password` callback to look up passwords from your `.pgpass` file:

```js
import pg from 'pg'
import pgpass from 'pgpass'

const { Pool } = pg

const pool = new Pool({
  user: 'my-user',
  host: 'localhost',
  database: 'my-db',
  password: (config) => {
    return new Promise((resolve, reject) => {
      const connection = {
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
      }
      pgpass(connection, (password) => {
        resolve(password)
      })
    })
  },
})
```

The `password` option accepts an async function (or a function that returns a `Promise`). It is called with the connection parameters, so you can pass them directly to `pgpass` for lookup.

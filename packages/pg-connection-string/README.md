pg-connection-string
====================

[![NPM](https://nodei.co/npm/pg-connection-string.png?compact=true)](https://nodei.co/npm/pg-connection-string/)

[![Build Status](https://travis-ci.org/iceddev/pg-connection-string.svg?branch=master)](https://travis-ci.org/iceddev/pg-connection-string)
[![Coverage Status](https://coveralls.io/repos/github/iceddev/pg-connection-string/badge.svg?branch=master)](https://coveralls.io/github/iceddev/pg-connection-string?branch=master)

Functions for dealing with a PostgresSQL connection string

`parse` method taken from [node-postgres](https://github.com/brianc/node-postgres.git)
Copyright (c) 2010-2014 Brian Carlson (brian.m.carlson@gmail.com)
MIT License

## Usage

```js
var parse = require('pg-connection-string').parse;

var config = parse('postgres://someuser:somepassword@somehost:381/somedatabase')
```

The resulting config contains a subset of the following properties:

* `user` - User with which to authenticate to the server
* `password` - Corresponding password
* `host` - Postgres server hostname or, for UNIX domain sockets, the socket filename
* `port` - port on which to connect
* `database` - Database name within the server
* `client_encoding` - string encoding the client will use
* `ssl`, either a boolean or an object with properties
  * `rejectUnauthorized`
  * `cert`
  * `key`
  * `ca`
* any other query parameters (for example, `application_name`) are preserved intact.

### ClientConfig Compatibility for TypeScript

The pg-connection-string `ConnectionOptions` interface is not compatible with the `ClientConfig` interface that [pg.Client](https://node-postgres.com/apis/client) expects. To remedy this, use the `parseIntoClientConfig` function instead of `parse`:

```ts
import { ClientConfig } from 'pg';
import { parseIntoClientConfig } from 'pg-connection-string';

const config: ClientConfig = parseIntoClientConfig('postgres://someuser:somepassword@somehost:381/somedatabase')
```

You can also use `toClientConfig` to convert an existing `ConnectionOptions` interface into a `ClientConfig` interface:

```ts
import { ClientConfig } from 'pg';
import { parse, toClientConfig } from 'pg-connection-string';

const config = parse('postgres://someuser:somepassword@somehost:381/somedatabase')
const clientConfig: ClientConfig = toClientConfig(config)
```

## Connection Strings

The short summary of acceptable URLs is:

 * `socket:<path>?<query>` - UNIX domain socket
 * `postgres://<user>:<password>@<host>:<port>/<database>?<query>` - TCP connection

But see below for more details.

### UNIX Domain Sockets

When user and password are not given, the socket path follows `socket:`, as in `socket:/var/run/pgsql`.
This form can be shortened to just a path: `/var/run/pgsql`.

When user and password are given, they are included in the typical URL positions, with an empty `host`, as in `socket://user:pass@/var/run/pgsql`.

Query parameters follow a `?` character, including the following special query parameters:

 * `db=<database>` - sets the database name (urlencoded)
 * `encoding=<encoding>` - sets the `client_encoding` property

### TCP Connections

TCP connections to the Postgres server are indicated with `pg:` or `postgres:` schemes (in fact, any scheme but `socket:` is accepted).
If username and password are included, they should be urlencoded.
The database name, however, should *not* be urlencoded.

Query parameters follow a `?` character, including the following special query parameters:
 * `host=<host>` - sets `host` property, overriding the URL's host
 * `encoding=<encoding>` - sets the `client_encoding` property
 * `ssl=1`, `ssl=true`, `ssl=0`, `ssl=false` - sets `ssl` to true or false, accordingly
 * `sslmode=<sslmode>`
   * `sslmode=disable` - sets `ssl` to false
   * `sslmode=no-verify` - sets `ssl` to `{ rejectUnauthorized: false }`
   * `sslmode=prefer`, `sslmode=require`, `sslmode=verify-ca`, `sslmode=verify-full` - sets `ssl` to true
 * `sslcert=<filename>` - reads data from the given file and includes the result as `ssl.cert`
 * `sslkey=<filename>` - reads data from the given file and includes the result as `ssl.key`
 * `sslrootcert=<filename>` - reads data from the given file and includes the result as `ssl.ca`

A bare relative URL, such as `salesdata`, will indicate a database name while leaving other properties empty.

All major and minor releases are briefly explained below.

For richer information consult the commit log on github with referenced pull requests.

We do not include break-fix version release in this file.

### v2.0

- Properly handle various PostgreSQL to JavaScript type conversions to avoid data loss:

```
PostgreSQL | pg@v2.0 JavaScript | pg@v1.0 JavaScript
--------------------------------|----------------
float4     | number (float)     | string
float8     | number (float)     | string
int8       | string             | number (int)
numeric    | string             | number (float)
decimal    | string             | number (float)
```

For more information see https://github.com/brianc/node-postgres/pull/353
If you are unhappy with these changes you can always [override the built in type parsing fairly easily](https://github.com/brianc/node-pg-parse-float). 

### v1.3

- Make client_encoding configurable and optional

### v1.2

- return field metadata on result object: access via result.fields[i].name/dataTypeID

### v1.1

- built in support for `JSON` data type for PostgreSQL Server @ v9.2.0 or greater

### v1.0

- remove deprecated functionality
  - Callback function passed to `pg.connect` now __requires__ 3 arguments
  - Client#pauseDrain() / Client#resumeDrain removed
  - numeric, decimal, and float data types no longer parsed into float before being returned. Will be returned from query results as `String`

### v0.15.0

- client now emits `end` when disconnected from back-end server
- if client is disconnected in the middle of a query, query receives an error

### v0.14.0

- add deprecation warnings in prep for v1.0
- fix read/write failures in native module under node v0.9.x

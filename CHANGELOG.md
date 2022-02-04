All major and minor releases are briefly explained below.

For richer information consult the commit log on github with referenced pull requests.

We do not include break-fix version release in this file.

### pg-pool@3.5.0

- Add connection [lifetime limit](https://github.com/brianc/node-postgres/pull/2698) config option.

### pg@8.7.0

- Add optional config to [pool](https://github.com/brianc/node-postgres/pull/2568) to allow process to exit if pool is idle.

### pg-cursor@2.7.0

- Convert to [es6 class](https://github.com/brianc/node-postgres/pull/2553)
- Add support for promises [to cursor methods](https://github.com/brianc/node-postgres/pull/2554)

### pg@8.6.0

- Better [SASL](https://github.com/brianc/node-postgres/pull/2436) error messages & more validation on bad configuration.
- Export [DatabaseError](https://github.com/brianc/node-postgres/pull/2445).
- Add [ParameterDescription](https://github.com/brianc/node-postgres/pull/2464) support to protocol parsing.
- Fix typescript [typedefs](https://github.com/brianc/node-postgres/pull/2490) with `--isolatedModules`.

### pg-query-stream@4.0.0

- Library has been [converted](https://github.com/brianc/node-postgres/pull/2376) to Typescript. The behavior is identical, but there could be subtle breaking changes due to class names changing or other small inconsistencies introduced by the conversion.

### pg@8.5.0

- Fix bug forwarding [ssl key](https://github.com/brianc/node-postgres/pull/2394).
- Convert pg-query-stream internals to [typescript](https://github.com/brianc/node-postgres/pull/2376).
- Performance [improvements](https://github.com/brianc/node-postgres/pull/2286).

### pg@8.4.0

- Switch to optional peer dependencies & remove [semver](https://github.com/brianc/node-postgres/commit/a02dfac5ad2e2abf0dc3a9817f953938acdc19b1) package which has been a small thorn in the side of a few users.
- Export `DatabaseError` from [pg-protocol](https://github.com/brianc/node-postgres/commit/58258430d52ee446721cc3e6611e26f8bcaa67f5).
- Add support for `sslmode` in the [connection string](https://github.com/brianc/node-postgres/commit/6be3b9022f83efc721596cc41165afaa07bfceb0).

### pg@8.3.0

- Support passing a [string of command line options flags](https://github.com/brianc/node-postgres/pull/2216) via the `{ options: string }` field on client/pool config.

### pg@8.2.0

- Switch internal protocol parser & serializer to [pg-protocol](https://github.com/brianc/node-postgres/tree/master/packages/pg-protocol). The change is backwards compatible but results in a significant performance improvement across the board, with some queries as much as 50% faster. This is the first work to land in an on-going performance improvment initiative I'm working on. Stay tuned as things are set to get much faster still! :rocket:

### pg-cursor@2.2.0

- Switch internal protocol parser & serializer to [pg-protocol](https://github.com/brianc/node-postgres/tree/master/packages/pg-protocol). The change is backwards compatible but results in a significant performance improvement across the board, with some queries as much as 50% faster.

### pg-query-stream@3.1.0

- Switch internal protocol parser & serializer to [pg-protocol](https://github.com/brianc/node-postgres/tree/master/packages/pg-protocol). The change is backwards compatible but results in a significant performance improvement across the board, with some queries as much as 50% faster.

### pg@8.1.0

- Switch to using [monorepo](https://github.com/brianc/node-postgres/tree/master/packages/pg-connection-string) version of `pg-connection-string`. This includes better support for SSL argument parsing from connection strings and ensures continuity of support.
- Add `&ssl=no-verify` option to connection string and `PGSSLMODE=no-verify` environment variable support for the pure JS driver. This is equivalent of passing `{ ssl: { rejectUnauthorized: false } }` to the client/pool constructor. The advantage of having support in connection strings and environment variables is it can be "externally" configured via environment variables and CLI arguments much more easily, and should remove the need to directly edit any application code for [the SSL default changes in 8.0](https://node-postgres.com/announcements#2020-02-25). This should make using `pg@8.x` significantly less difficult on environments like Heroku for example.

### pg-pool@3.2.0

- Same changes to `pg` impact `pg-pool` as they both use the same connection parameter and connection string parsing code for configuring SSL.

### pg-pool@3.1.0

- Add [maxUses](https://github.com/brianc/node-postgres/pull/2157) config option.

### pg@8.0.0

#### note: for detailed release notes please [check here](https://node-postgres.com/announcements#2020-02-25)

- Remove versions of node older than `6 lts` from the test matrix. `pg>=8.0` may still work on older versions but it is no longer officially supported.
- Change default behavior when not specifying `rejectUnauthorized` with the SSL connection parameters. Previously we defaulted to `rejectUnauthorized: false` when it was not specifically included. We now default to `rejectUnauthorized: true.` Manually specify `{ ssl: { rejectUnauthorized: false } }` for old behavior.
- Change [default database](https://github.com/brianc/node-postgres/pull/1679) when not specified to use the `user` config option if available. Previously `process.env.USER` was used.
- Change `pg.Pool` and `pg.Query` to [be](https://github.com/brianc/node-postgres/pull/2126) an [es6 class](https://github.com/brianc/node-postgres/pull/2063).
- Make `pg.native` non enumerable.
- `notice` messages are [no longer instances](https://github.com/brianc/node-postgres/pull/2090) of `Error`.
- Passwords no longer [show up](https://github.com/brianc/node-postgres/pull/2070) when instances of clients or pools are logged.

### pg@7.18.0

- This will likely be the last minor release before pg@8.0.
- This version contains a few bug fixes and adds a deprecation warning for [a pending change in 8.0](https://github.com/brianc/node-postgres/issues/2009#issuecomment-579371651) which will flip the default behavior over SSL from `rejectUnauthorized` from `false` to `true` making things more secure in the general use case.

### pg-query-stream@3.0.0

- [Rewrote stream internals](https://github.com/brianc/node-postgres/pull/2051) to better conform to node stream semantics. This should make pg-query-stream much better at respecting [highWaterMark](https://nodejs.org/api/stream.html#stream_new_stream_readable_options) and getting rid of some edge case bugs when using pg-query-stream as an async iterator. Due to the size and nature of this change (effectively a full re-write) it's safest to bump the semver major here, though almost all tests remain untouched and still passing, which brings us to a breaking change to the API....
- Changed `stream.close` to `stream.destroy` which is the [official](https://nodejs.org/api/stream.html#stream_readable_destroy_error) way to terminate a readable stream. This is a **breaking change** if you rely on the `stream.close` method on pg-query-stream...though should be just a find/replace type operation to upgrade as the semantics remain very similar (not exactly the same, since internals are rewritten, but more in line with how streams are "supposed" to behave).
- Unified the `config.batchSize` and `config.highWaterMark` to both do the same thing: control how many rows are buffered in memory. The `ReadableStream` will manage exactly how many rows are requested from the cursor at a time. This should give better out of the box performance and help with efficient async iteration.

### pg@7.17.0

- Add support for `idle_in_transaction_session_timeout` [option](https://github.com/brianc/node-postgres/pull/2049).

### 7.16.0

- Add optional, opt-in behavior to test new, [faster query pipeline](https://github.com/brianc/node-postgres/pull/2044). This is experimental, and not documented yet. The pipeline changes will grow significantly after the 8.0 release.

### 7.15.0

- Change repository structure to support lerna & future monorepo [development](https://github.com/brianc/node-postgres/pull/2014).
- [Warn about deprecation](https://github.com/brianc/node-postgres/pull/2021) for calling constructors without `new`.

### 7.14.0

- Reverts 7.13.0 as it contained [an accidental breaking change](https://github.com/brianc/node-postgres/pull/2010) for self-signed SSL cert verification. 7.14.0 is identical to 7.12.1.

### 7.13.0

- Add support for [all tls.connect()](https://github.com/brianc/node-postgres/pull/1996) options.

### 7.12.0

- Add support for [async password lookup](https://github.com/brianc/node-postgres/pull/1926).

### 7.11.0

- Add support for [connection_timeout](https://github.com/brianc/node-postgres/pull/1847/files#diff-5391bde944956870128be1136e7bc176R63) and [keepalives_idle](https://github.com/brianc/node-postgres/pull/1847).

### 7.10.0

- Add support for [per-query types](https://github.com/brianc/node-postgres/pull/1825).

### 7.9.0

- Add support for [sasl/scram authentication](https://github.com/brianc/node-postgres/pull/1835).

### 7.8.0

- Add support for passing [secureOptions](https://github.com/brianc/node-postgres/pull/1804) SSL config.
- Upgrade [pg-types](https://github.com/brianc/node-postgres/pull/1806) to 2.0.

### 7.7.0

- Add support for configurable [query timeout](https://github.com/brianc/node-postgres/pull/1760) on a client level.

### 7.6.0

- Add support for ["bring your own promise"](https://github.com/brianc/node-postgres/pull/1518)

### 7.5.0

- Better [error message](https://github.com/brianc/node-postgres/commit/11a4793452d618c53e019416cc886ad38deb1aa7) when passing `null` or `undefined` to `client.query`.
- Better [error handling](https://github.com/brianc/node-postgres/pull/1503) on queued queries.

### 7.4.0

- Add support for [Uint8Array](https://github.com/brianc/node-postgres/pull/1448) values.

### 7.3.0

- Add support for [statement timeout](https://github.com/brianc/node-postgres/pull/1436).

### 7.2.0

- Pinned pg-pool and pg-types to a tighter semver range. This is likely not a noticeable change for you unless you were specifically installing older versions of those libraries for some reason, but making it a minor bump here just in case it could cause any confusion.

### 7.1.0

#### Enhancements

- [You can now supply both a connection string and additional config options to clients.](https://github.com/brianc/node-postgres/pull/1363)

### 7.0.0

#### Breaking Changes

- Drop support for node < `4.x`.
- Remove `pg.connect` `pg.end` and `pg.cancel` singleton methods.
- `Client#connect(callback)` now returns `undefined`. It used to return an event emitter.
- Upgrade [pg-pool](https://github.com/brianc/node-pg-pool) to `2.x`.
- Upgrade [pg-native](https://github.com/brianc/node-pg-native) to `2.x`.
- Standardize error message fields between JS and native driver. The only breaking changes were in the native driver as its field names were brought into alignment with the existing JS driver field names.
- Result from multi-statement text queries such as `SELECT 1; SELECT 2;` are now returned as an array of results instead of a single result with 1 array containing rows from both queries.

[Please see here for a migration guide](https://node-postgres.com/guides/upgrading)

#### Enhancements

- Overhauled documentation: [https://node-postgres.com](https://node-postgres.com).
- Add `Client#connect() => Promise<void>` and `Client#end() => Promise<void>` calls. Promises are now returned from all async methods on clients _if and only if_ no callback was supplied to the method.
- Add `connectionTimeoutMillis` to pg-pool.

### v6.2.0

- Add support for [parsing `replicationStart` messages](https://github.com/brianc/node-postgres/pull/1271/files).

### v6.1.0

- Add optional callback parameter to the pure JavaScript `client.end` method. The native client already supported this.

### v6.0.0

#### Breaking Changes

- Remove `pg.pools`. There is still a reference kept to the pools created & tracked by `pg.connect` but it has been renamed, is considered private, and should not be used. Accessing this API directly was uncommon and was _supposed_ to be private but was incorrectly documented on the wiki. Therefore, it is a breaking change of an (unintentionally) public interface to remove it by renaming it & making it private. Eventually `pg.connect` itself will be deprecated in favor of instantiating pools directly via `new pg.Pool()` so this property should become completely moot at some point. In the mean time...check out the new features...

#### New features

- Replace internal pooling code with [pg-pool](https://github.com/brianc/node-pg-pool). This is the first step in eventually deprecating and removing the singleton `pg.connect`. The pg-pool constructor is exported from node-postgres at `require('pg').Pool`. It provides a backwards compatible interface with `pg.connect` as well as a promise based interface & additional niceties.

You can now create an instance of a pool and don't have to rely on the `pg` singleton for anything:

```
var pg = require('pg')

var pool = new pg.Pool()

// your friendly neighborhood pool interface, without the singleton
pool.connect(function(err, client, done) {
  // ...
})
```

Promise support & other goodness lives now in [pg-pool](https://github.com/brianc/node-pg-pool).

**Please** read the readme at [pg-pool](https://github.com/brianc/node-pg-pool) for the full api.

- Included support for tcp keep alive. Enable it as follows:

```js
var client = new Client({ keepAlive: true })
```

This should help with backends incorrectly considering idle clients to be dead and prematurely disconnecting them.

### v5.1.0

- Make the query object returned from `client.query` implement the promise interface. This is the first step towards promisifying more of the node-postgres api.

Example:

```js
var client = new Client()
client.connect()
client.query('SELECT $1::text as name', ['brianc']).then(function (res) {
  console.log('hello from', res.rows[0])
  client.end()
})
```

### v5.0.0

#### Breaking Changes

- `require('pg').native` now returns null if the native bindings cannot be found; previously, this threw an exception.

#### New Features

- better error message when passing `undefined` as a query parameter
- support for `defaults.connectionString`
- support for `returnToHead` being passed to [generic pool](https://github.com/coopernurse/node-pool)

### v4.5.0

- Add option to parse JS date objects in query parameters as [UTC](https://github.com/brianc/node-postgres/pull/943)

### v4.4.0

- Warn to `stderr` if a named query exceeds 63 characters which is the max length supported by postgres.

### v4.3.0

- Unpin `pg-types` semver. Allow it to float against `pg-types@1.x`.

### v4.2.0

- Support for additional error fields in postgres >= 9.3 if available.

### v4.1.0

- Allow type parser overrides on a [per-client basis](https://github.com/brianc/node-postgres/pull/679)

### v4.0.0

- Make [native bindings](https://github.com/brianc/node-pg-native.git) an optional install with `npm install pg-native`
- No longer surround query result callback with `try/catch` block.
- Remove built in COPY IN / COPY OUT support - better implementations provided by [pg-copy-streams](https://github.com/brianc/node-pg-copy-streams.git) and [pg-native](https://github.com/brianc/node-pg-native.git)

### v3.6.0

- Include support for (parsing JSONB)[https://github.com/brianc/node-pg-types/pull/13] (supported in postgres 9.4)

### v3.5.0

- Include support for parsing boolean arrays

### v3.4.0

- Include port as connection parameter to [unix sockets](https://github.com/brianc/node-postgres/pull/604)
- Better support for odd [date parsing](https://github.com/brianc/node-pg-types/pull/8)

### v3.2.0

- Add support for parsing [date arrays](https://github.com/brianc/node-pg-types/pull/3)
- Expose array parsers on [pg.types](https://github.com/brianc/node-pg-types/pull/2)
- Allow [pool](https://github.com/brianc/node-postgres/pull/591) to be configured

### v3.1.0

- Add [count of the number of times a client has been checked out from the pool](https://github.com/brianc/node-postgres/pull/556)
- Emit `end` from `pg` object [when a pool is drained](https://github.com/brianc/node-postgres/pull/571)

### v3.0.0

#### Breaking changes

- [Parse the DATE PostgreSQL type as local time](https://github.com/brianc/node-postgres/pull/514)

After [some discussion](https://github.com/brianc/node-postgres/issues/510) it was decided node-postgres was non-compliant in how it was handling DATE results. They were being converted to UTC, but the PostgreSQL documentation specifies they should be returned in the client timezone. This is a breaking change, and if you use the `date` type you might want to examine your code and make sure nothing is impacted.

- [Fix possible numeric precision loss on numeric & int8 arrays](https://github.com/brianc/node-postgres/pull/501)

pg@v2.0 included changes to not convert large integers into their JavaScript number representation because of possibility for numeric precision loss. The same types in arrays were not taken into account. This fix applies the same type of type-coercion rules to arrays of those types, so there will be no more possible numeric loss on an array of very large int8s for example. This is a breaking change because now a return type from a query of `int8[]` will contain _string_ representations
of the integers. Use your favorite JavaScript bignum module to represent them without precision loss, or punch over the type converter to return the old style arrays again.

- [Fix to input array of dates being improperly converted to utc](https://github.com/benesch/node-postgres/commit/c41eedc3e01e5527a3d5c242fa1896f02ef0b261#diff-7172adb1fec2457a2700ed29008a8e0aR108)

Single `date` parameters were properly sent to the PostgreSQL server properly in local time, but an input array of dates was being changed into utc dates. This is a violation of what PostgreSQL expects. Small breaking change, but none-the-less something you should check out if you are inserting an array of dates.

- [Query no longer emits `end` event if it ends due to an error](https://github.com/brianc/node-postgres/commit/357b64d70431ec5ca721eb45a63b082c18e6ffa3)

This is a small change to bring the semantics of query more in line with other EventEmitters. The tests all passed after this change, but I suppose it could still be a breaking change in certain use cases. If you are doing clever things with the `end` and `error` events of a query object you might want to check to make sure its still behaving normally, though it is most likely not an issue.

#### New features

- [Supercharge `prepareValue`](https://github.com/brianc/node-postgres/pull/555)

The long & short of it is now any object you supply in the list of query values will be inspected for a `.toPostgres` method. If the method is present it will be called and its result used as the raw text value sent to PostgreSQL for that value. This allows the same type of custom type coercion on query parameters as was previously afforded to query result values.

- [Domain aware connection pool](https://github.com/brianc/node-postgres/pull/531)

If domains are active node-postgres will honor them and do everything it can to ensure all callbacks are properly fired in the active domain. If you have tried to use domains with node-postgres (or many other modules which pool long lived event emitters) you may have run into an issue where the active domain changes before and after a callback. This has been a longstanding footgun within node-postgres and I am happy to get it fixed.

- [Disconnected clients now removed from pool](https://github.com/brianc/node-postgres/pull/543)

Avoids a scenario where your pool could fill up with disconnected & unusable clients.

- [Break type parsing code into separate module](https://github.com/brianc/node-postgres/pull/541)

To provide better documentation and a clearer explanation of how to override the query result parsing system we broke the type converters [into their own module](https://github.com/brianc/node-pg-types). There is still work around removing the 'global-ness' of the type converters so each query or connection can return types differently, but this is a good first step and allow a lot more obvious way to return int8 results as JavaScript numbers, for example

### v2.11.0

- Add support for [application_name](https://github.com/brianc/node-postgres/pull/497)

### v2.10.0

- Add support for [the password file](http://www.postgresql.org/docs/9.3/static/libpq-pgpass.html)

### v2.9.0

- Add better support for [unix domain socket](https://github.com/brianc/node-postgres/pull/487) connections

### v2.8.0

- Add support for parsing JSON[] and UUID[] result types

### v2.7.0

- Use single row mode in native bindings when available [@rpedela]
  - reduces memory consumption when handling row values in 'row' event
- Automatically bind buffer type parameters as binary [@eugeneware]

### v2.6.0

- Respect PGSSLMODE environment variable

### v2.5.0

- Ability to opt-in to int8 parsing via `pg.defaults.parseInt8 = true`

### v2.4.0

- Use eval in the result set parser to increase performance

### v2.3.0

- Remove built-in support for binary Int64 parsing.
  _Due to the low usage & required compiled dependency this will be pushed into a 3rd party add-on_

### v2.2.0

- [Add support for excapeLiteral and escapeIdentifier in both JavaScript and the native bindings](https://github.com/brianc/node-postgres/pull/396)

### v2.1.0

- Add support for SSL connections in JavaScript driver
- this means you can connect to heroku postgres from your local machine without the native bindings!
- [Add field metadata to result object](https://github.com/brianc/node-postgres/blob/master/test/integration/client/row-description-on-results-tests.js)
- [Add ability for rows to be returned as arrays instead of objects](https://github.com/brianc/node-postgres/blob/master/test/integration/client/results-as-array-tests.js)

### v2.0.0

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

### v1.3.0

- Make client_encoding configurable and optional

### v1.2.0

- return field metadata on result object: access via result.fields[i].name/dataTypeID

### v1.1.0

- built in support for `JSON` data type for PostgreSQL Server @ v9.2.0 or greater

### v1.0.0

- remove deprecated functionality
  - Callback function passed to `pg.connect` now **requires** 3 arguments
  - Client#pauseDrain() / Client#resumeDrain removed
  - numeric, decimal, and float data types no longer parsed into float before being returned. Will be returned from query results as `String`

### v0.15.0

- client now emits `end` when disconnected from back-end server
- if client is disconnected in the middle of a query, query receives an error

### v0.14.0

- add deprecation warnings in prep for v1.0
- fix read/write failures in native module under node v0.9.x

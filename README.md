# node-postgres

![Build Status](https://github.com/brianc/node-postgres/actions/workflows/ci.yml/badge.svg)
<span class="badge-npmversion"><a href="https://npmjs.org/package/pg" title="View this project on NPM"><img src="https://img.shields.io/npm/v/pg.svg" alt="NPM version" /></a></span>
<span class="badge-npmdownloads"><a href="https://npmjs.org/package/pg" title="View this project on NPM"><img src="https://img.shields.io/npm/dm/pg.svg" alt="NPM downloads" /></a></span>

Non-blocking PostgreSQL client for Node.js. Pure JavaScript and optional native libpq bindings.

## Monorepo

This repo is a monorepo which contains the core [pg](https://github.com/brianc/node-postgres/tree/master/packages/pg) module as well as a handful of related modules.

- [pg](https://github.com/brianc/node-postgres/tree/master/packages/pg)
- [pg-pool](https://github.com/brianc/node-postgres/tree/master/packages/pg-pool)
- [pg-native](https://github.com/brianc/node-postgres/tree/master/packages/pg-native)
- [pg-cursor](https://github.com/brianc/node-postgres/tree/master/packages/pg-cursor)
- [pg-query-stream](https://github.com/brianc/node-postgres/tree/master/packages/pg-query-stream)
- [pg-connection-string](https://github.com/brianc/node-postgres/tree/master/packages/pg-connection-string)
- [pg-protocol](https://github.com/brianc/node-postgres/tree/master/packages/pg-protocol)

## Install

```
npm install pg
```

## Documentation

Each package in this repo should have its own readme more focused on how to develop/contribute. For overall documentation on the project and the related modules managed by this repo please see:

### :star: [Documentation](https://node-postgres.com) :star:

The source repo for the documentation is available for contribution [here](https://github.com/brianc/node-postgres/tree/master/docs).

### Features

- Pure JavaScript client and native libpq bindings share _the same API_
- Connection pooling
- Extensible JS ↔ PostgreSQL data-type coercion
- Supported PostgreSQL features
  - Parameterized queries
  - Named statements with query plan caching
  - Async notifications with `LISTEN/NOTIFY`
  - Bulk import & export with `COPY TO/COPY FROM`

### Extras

node-postgres is by design pretty light on abstractions. These are some handy modules we've been using over the years to complete the picture.
The entire list can be found on our [wiki](https://github.com/brianc/node-postgres/wiki/Extras).

## Support

node-postgres is free software. If you encounter a bug with the library please open an issue on the [GitHub repo](https://github.com/brianc/node-postgres). If you have questions unanswered by the documentation please open an issue pointing out how the documentation was unclear & I will do my best to make it better!

When you open an issue please provide:

- version of Node
- version of Postgres
- smallest possible snippet of code to reproduce the problem

You can also follow me [@briancarlson](https://twitter.com/briancarlson) if that's your thing. I try to always announce noteworthy changes & developments with node-postgres on Twitter.

## Sponsorship :two_hearts:

node-postgres's continued development has been made possible in part by generous financial support from [the community](https://github.com/brianc/node-postgres/blob/master/SPONSORS.md).

If you or your company are benefiting from node-postgres and would like to help keep the project financially sustainable [please consider supporting](https://github.com/sponsors/brianc) its development.

### Featured sponsor

Special thanks to [medplum](https://medplum.com) for their generous and thoughtful support of node-postgres!

![medplum](https://raw.githubusercontent.com/medplum/medplum-logo/refs/heads/main/medplum-logo.png)

## Contributing

**:heart: contributions!**

I will **happily** accept your pull request if it:

- **has tests**
- looks reasonable
- does not break backwards compatibility

If your change involves breaking backwards compatibility please please point that out in the pull request & we can discuss & plan when and how to release it and what type of documentation or communication it will require.

### Setting up for local development

1. Clone the repo
2. Ensure you have installed libpq-dev in your system.
3. From your workspace root run `yarn` and then `yarn lerna bootstrap`
4. Ensure you have a PostgreSQL instance running with SSL enabled and an empty database for tests
5. Ensure you have the proper environment variables configured for connecting to the instance
6. Run `yarn test` to run all the tests

## Troubleshooting and FAQ

The causes and solutions to common errors can be found among the [Frequently Asked Questions (FAQ)](https://github.com/brianc/node-postgres/wiki/FAQ)

## License

Copyright (c) 2010-2020 Brian Carlson (brian.m.carlson@gmail.com)

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

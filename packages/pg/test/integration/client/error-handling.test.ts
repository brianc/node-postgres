import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'

describe('error-handling', () => {
  const pg = helper.pg
  const Client = pg.Client
  const DatabaseError = pg.DatabaseError

  const createErorrClient = function () {
    const client = helper.client()
    client.once('error', function () {
      assert.fail('Client shoud not throw error during query execution')
    })
    client.on('drain', client.end.bind(client))
    return client
  }

  // vitest's describe replaces the legacy Suite

  it('sending non-array argument as values causes an error callback', () =>
    new Promise<void>((done) => {
      const client = new Client()
      client.connect((err) => {
        if (err) {
          return done(err as never)
        }
        client.query('select $1::text as name', 'foo' as never, (err) => {
          assert(err instanceof Error)
          client.query('SELECT $1::text as name', ['foo'], (err, res) => {
            assert.equal(res.rows[0].name, 'foo')
            client.end(done)
          })
        })
      })
    }))

  it('re-using connections results in error callback', () =>
    new Promise<void>((done) => {
      const client = new Client()
      client.connect((err) => {
        if (err) {
          return done(err as never)
        }
        client.connect((err) => {
          assert(err instanceof Error)
          client.end(done)
        })
      })
    }))

  it('re-using connections results in promise rejection', () => {
    const client = new Client()
    return client.connect().then(() => {
      return helper.rejection(client.connect()).then((err) => {
        assert(err instanceof Error)
        return client.end()
      })
    })
  })

  it('using a client after closing it results in error', () =>
    new Promise<void>((done) => {
      const client = new Client()
      client.connect((err) => {
        if (err) {
          return done(err as never)
        }
        client.end(
          assert.calls(() => {
            client.query(
              'SELECT 1',
              assert.calls((err) => {
                assert.equal(err.message, 'Client was closed and is not queryable')
                done()
              })
            )
          })
        )
      })
    }))

  it('query receives error on client shutdown', () =>
    new Promise<void>((done) => {
      const client = new Client()
      client.connect(
        assert.success(function () {
          const config = {
            text: 'select pg_sleep(5)',
            name: 'foobar',
          }
          let queryError: Error | undefined
          client.query(
            new pg.Query(config),
            assert.calls(function (err, _res) {
              assert(err instanceof Error)
              queryError = err
            })
          )
          setTimeout(() => client.end(), 50)
          client.once('end', () => {
            assert(queryError instanceof Error)
            done()
          })
        })
      )
    }))

  const ensureFuture = function (testClient: InstanceType<typeof Client>, done: () => void): void {
    const goodQuery = testClient.query(new pg.Query('select age from boom'))
    assert.emits(goodQuery, 'row', function (row) {
      assert.equal(row.age, 28)
      done()
    })
  }

  it('when query is parsing', () =>
    new Promise<void>((done) => {
      const client = createErorrClient()

      client.query({ text: 'CREATE TEMP TABLE boom(age integer); INSERT INTO boom (age) VALUES (28);' })

      // this query wont parse since there isn't a table named bang
      const query = client.query(
        new pg.Query({
          text: 'select * from bang where name = $1',
          values: ['0'],
        })
      )

      assert.emits(query, 'error', function () {
        ensureFuture(client, done)
      })
    }))

  it('when a query is binding', () =>
    new Promise<void>((done) => {
      const client = createErorrClient()

      client.query({ text: 'CREATE TEMP TABLE boom(age integer); INSERT INTO boom (age) VALUES (28);' })

      const query = client.query(
        new pg.Query({
          text: 'select * from boom where age = $1',
          values: ['asldkfjasdf'],
        })
      )

      assert.emits(query, 'error', function (err) {
        if (!helper.config.native) {
          assert(err instanceof DatabaseError)
        }
        assert.equal(err.severity, 'ERROR')
        ensureFuture(client, done)
      })
    }))

  it('non-query error with callback', () =>
    new Promise<void>((done) => {
      const client = new Client({
        user: 'asldkfjsadlfkj',
      })
      client.connect(
        assert.calls(function (error) {
          assert(error instanceof Error)
          done()
        })
      )
    }))

  it('non-error calls supplied callback', () =>
    new Promise<void>((done) => {
      const client = new Client({
        user: helper.args.user,
        password: helper.args.password,
        host: helper.args.host,
        port: helper.args.port,
        database: helper.args.database,
      })

      client.connect(
        assert.calls(function (err) {
          assert.ifError(err)
          client.end(done)
        })
      )
    }))

  it('when connecting to an invalid host with callback', () =>
    new Promise<void>((done) => {
      const client = new Client({
        user: 'very invalid username',
      })
      client.on('error', () => {
        assert.fail('unexpected error event when connecting')
      })
      client.connect(function (error) {
        assert(error instanceof Error)
        done()
      })
    }))

  it('when connecting to invalid host with promise', () =>
    new Promise<void>((done) => {
      const client = new Client({
        user: 'very invalid username',
      })
      client.on('error', () => {
        assert.fail('unexpected error event when connecting')
      })
      client.connect().catch(() => done())
    }))

  it('non-query error', () =>
    new Promise<void>((done) => {
      const client = new Client({
        user: 'asldkfjsadlfkj',
      })
      client.connect().catch((e) => {
        assert(e instanceof Error)
        done()
      })
    }))

  it('within a simple query', () =>
    new Promise<void>((done) => {
      const client = createErorrClient()

      const query = client.query(new pg.Query("select eeeee from yodas_dsflsd where pixistix = 'zoiks!!!'"))

      assert.emits(query, 'error', function (error) {
        if (!helper.config.native) {
          assert(error instanceof DatabaseError)
        }
        assert.equal(error.severity, 'ERROR')
        done()
      })
    }))

  it('connected, idle client error', () =>
    new Promise<void>((done) => {
      const client = new Client()
      client.connect((err) => {
        if (err) {
          throw new Error('Should not receive error callback after connection')
        }
        setImmediate(() => {
          ;((client as { connection?: { emit: (e: string, err: Error) => void } }).connection ||
            (client as { native?: { emit: (e: string, err: Error) => void } }).native)!.emit(
            'error',
            new Error('expected')
          )
        })
      })
      client.on('error', (err) => {
        assert.equal(err.message, 'expected')
        client.end(done)
      })
    }))

  it('cannot pass non-string values to query as text', () =>
    new Promise<void>((done) => {
      const client = new Client()
      client.connect((err) => {
        if (err) {
          return done(err as never)
        }
        client.query({ text: {} as never }, (err) => {
          assert(err)
          client.query({}, (_err: unknown) => {
            client.on('drain', () => {
              client.end(done)
            })
          })
        })
      })
    }))
})

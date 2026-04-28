import assert from 'node:assert'
import * as dns from 'node:dns'

import { describe, it } from 'vitest'

import Client from '../../../src/client.ts'
import ConnectionParameters from '../../../src/connection-parameters.ts'
import defaults from '../../../src/defaults.ts'

// clear process.env
for (const key in process.env) {
  delete process.env[key]
}

describe('ConnectionParameters', () => {
  it('construction', () => {
    assert.ok(new ConnectionParameters(), 'with null config')
    assert.ok(new ConnectionParameters({ user: 'asdf' }), 'with config object')
    assert.ok(new ConnectionParameters('postgres://localhost/postgres'), 'with connection string')
  })

  const compare = (actual: Record<string, unknown>, expected: Record<string, unknown>, type: string): void => {
    const expectedDatabase = expected.database === undefined ? expected.user : expected.database

    assert.equal(actual.user, expected.user, type + ' user')
    assert.equal(actual.database, expectedDatabase, type + ' database')
    assert.equal(actual.port, expected.port, type + ' port')
    assert.equal(actual.host, expected.host, type + ' host')
    assert.equal(actual.password, expected.password, type + ' password')
    assert.equal(actual.binary, expected.binary, type + ' binary')
    assert.equal(actual.statement_timeout, expected.statement_timeout, type + ' statement_timeout')
    assert.equal(actual.lock_timeout, expected.lock_timeout, type + ' lock_timeout')
    assert.equal(actual.options, expected.options, type + ' options')
    assert.equal(
      actual.idle_in_transaction_session_timeout,
      expected.idle_in_transaction_session_timeout,
      type + ' idle_in_transaction_session_timeout'
    )
  }

  it('initializing from defaults', () => {
    const subject = new ConnectionParameters()
    compare(subject as unknown as Record<string, unknown>, defaults as unknown as Record<string, unknown>, 'defaults')
    assert.ok(subject.isDomainSocket === false)
  })

  it('initializing from defaults with connectionString set', () => {
    const config = {
      user: 'brians-are-the-best',
      database: 'scoobysnacks',
      port: 7777,
      password: 'mypassword',
      host: 'foo.bar.net',
      binary: defaults.binary,
      statement_timeout: false,
      lock_timeout: false,
      idle_in_transaction_session_timeout: false,
      options: '-c geqo=off',
    }

    const original_value = defaults.connectionString
    defaults.connectionString =
      'postgres://brians-are-the-best:mypassword@foo.bar.net:7777/scoobysnacks?options=-c geqo=off'
    const subject = new ConnectionParameters(defaults as never)
    defaults.connectionString = original_value
    compare(subject as unknown as Record<string, unknown>, config, 'defaults-connectionString')
  })

  it('initializing from config', () => {
    const config = {
      user: 'brian',
      database: 'home',
      port: 7777,
      password: 'pizza',
      binary: true,
      encoding: 'utf8',
      host: 'yo',
      ssl: { asdf: 'blah' },
      statement_timeout: 15000,
      lock_timeout: 15000,
      idle_in_transaction_session_timeout: 15000,
      options: '-c geqo=off',
    }
    const subject = new ConnectionParameters(config)
    compare(subject as unknown as Record<string, unknown>, config, 'config')
    assert.ok(subject.isDomainSocket === false)
  })

  it('initializing from config and config.connectionString', () => {
    const subject1 = new ConnectionParameters({ connectionString: 'postgres://test@host/db' })
    const subject2 = new ConnectionParameters({ connectionString: 'postgres://test@host/db?ssl=1' })
    const subject3 = new ConnectionParameters({ connectionString: 'postgres://test@host/db', ssl: true })
    const subject4 = new ConnectionParameters({ connectionString: 'postgres://test@host/db?ssl=1', ssl: false })

    assert.equal(subject1.ssl, false)
    assert.equal(subject2.ssl, true)
    assert.equal(subject3.ssl, true)
    assert.equal(subject4.ssl, true)
  })

  it('escape spaces if present', () => {
    const subject = new ConnectionParameters('postgres://localhost/post gres')
    assert.equal(subject.database, 'post gres')
  })

  it('do not double escape spaces', () => {
    const subject = new ConnectionParameters('postgres://localhost/post%20gres')
    assert.equal(subject.database, 'post gres')
  })

  it('initializing with unix domain socket', () => {
    const subject = new ConnectionParameters('/var/run/')
    assert.ok(subject.isDomainSocket)
    assert.equal(subject.host, '/var/run/')
    assert.equal(subject.database, defaults.user)
  })

  it('initializing with unix domain socket and a specific database, the simple way', () => {
    const subject = new ConnectionParameters('/var/run/ mydb')
    assert.ok(subject.isDomainSocket)
    assert.equal(subject.host, '/var/run/')
    assert.equal(subject.database, 'mydb')
  })

  it('initializing with unix domain socket, the health way', () => {
    const subject = new ConnectionParameters('socket:/some path/?db=my[db]&encoding=utf8')
    assert.ok(subject.isDomainSocket)
    assert.equal(subject.host, '/some path/')
    assert.equal(subject.database, 'my[db]')
    assert.equal(subject.client_encoding, 'utf8')
  })

  it('initializing with unix domain socket, the escaped health way', () => {
    const subject = new ConnectionParameters('socket:/some%20path/?db=my%2Bdb&encoding=utf8')
    assert.ok(subject.isDomainSocket)
    assert.equal(subject.host, '/some path/')
    assert.equal(subject.database, 'my+db')
    assert.equal(subject.client_encoding, 'utf8')
  })

  const checkForPart = (array: string[], part: string): void => {
    assert.ok(array.indexOf(part) > -1, array.join(' ') + ' did not contain ' + part)
  }

  const getDNSHost = (host: string): Promise<string> =>
    new Promise((resolve, reject) => {
      dns.lookup(host, (err, addresses) => {
        if (err) reject(err)
        else resolve(addresses)
      })
    })

  it('builds simple string', async () => {
    const config = {
      user: 'brian',
      password: 'xyz',
      host: 'localhost',
      port: 888,
      database: 'bam',
    }
    const subject = new ConnectionParameters(config)
    const dnsHost = await getDNSHost(config.host)
    await new Promise<void>((resolve) => {
      subject.getLibpqConnectionString((err, constring) => {
        assert(!err)
        const parts = (constring || '').split(' ')
        checkForPart(parts, "user='brian'")
        checkForPart(parts, "password='xyz'")
        checkForPart(parts, `hostaddr='${dnsHost}'`)
        checkForPart(parts, "port='888'")
        checkForPart(parts, "dbname='bam'")
        resolve()
      })
    })
  })

  it('builds dns string', async () => {
    const config = {
      user: 'brian',
      password: 'asdf',
      host: 'localhost',
      port: 5432,
    }
    const subject = new ConnectionParameters(config)
    const dnsHost = await getDNSHost(config.host)
    await new Promise<void>((resolve) => {
      subject.getLibpqConnectionString((err, constring) => {
        assert(!err)
        const parts = (constring || '').split(' ')
        checkForPart(parts, "user='brian'")
        checkForPart(parts, `hostaddr='${dnsHost}'`)
        resolve()
      })
    })
  })

  it('error when dns fails', () => {
    const config = {
      user: 'brian',
      password: 'asf',
      host: 'asdlfkjasldfkksfd#!$!!!!..com',
      port: 5432,
    }
    const subject = new ConnectionParameters(config)
    return new Promise<void>((resolve) => {
      subject.getLibpqConnectionString((err, constring) => {
        assert.ok(err)
        assert.strictEqual(constring, null)
        resolve()
      })
    })
  })

  it('connecting to unix domain socket', () => {
    const config = {
      user: 'brian',
      password: 'asf',
      host: '/tmp/',
      port: 5432,
    }
    const subject = new ConnectionParameters(config)
    return new Promise<void>((resolve) => {
      subject.getLibpqConnectionString((err, constring) => {
        assert(!err)
        const parts = (constring || '').split(' ')
        checkForPart(parts, "user='brian'")
        checkForPart(parts, "host='/tmp/'")
        resolve()
      })
    })
  })

  it('config contains quotes and backslashes', () => {
    const config = {
      user: 'not\\brian',
      password: "bad'chars",
      host: '/tmp/',
      port: 5432,
    }
    const subject = new ConnectionParameters(config)
    return new Promise<void>((resolve) => {
      subject.getLibpqConnectionString((err, constring) => {
        assert(!err)
        const parts = (constring || '').split(' ')
        checkForPart(parts, "user='not\\\\brian'")
        checkForPart(parts, "password='bad\\'chars'")
        resolve()
      })
    })
  })

  it('encoding can be specified by config', () => {
    const config = { client_encoding: 'utf-8' }
    const subject = new ConnectionParameters(config)
    return new Promise<void>((resolve) => {
      subject.getLibpqConnectionString((err, constring) => {
        assert(!err)
        const parts = (constring || '').split(' ')
        checkForPart(parts, "client_encoding='utf-8'")
        resolve()
      })
    })
  })

  it('password contains  < and/or >  characters', () => {
    const sourceConfig = {
      user: 'brian',
      password: 'hello<ther>e',
      host: 'localhost',
      port: 5432,
      database: 'postgres',
    }
    const connectionString =
      'postgres://' +
      sourceConfig.user +
      ':' +
      sourceConfig.password +
      '@' +
      sourceConfig.host +
      ':' +
      sourceConfig.port +
      '/' +
      sourceConfig.database
    const subject = new ConnectionParameters(connectionString)
    assert.equal(subject.password, sourceConfig.password)
  })

  it('username or password contains weird characters', () => {
    defaults.ssl = true
    const strang = 'pg://my f%irst name:is&%awesome!@localhost:9000'
    const subject = new ConnectionParameters(strang)
    assert.equal(subject.user, 'my f%irst name')
    assert.equal(subject.password, 'is&%awesome!')
    assert.equal(subject.host, 'localhost')
    assert.equal(subject.ssl, true)
  })

  it('url is properly encoded', () => {
    const encoded = 'pg://bi%25na%25%25ry%20:s%40f%23@localhost/%20u%2520rl'
    const subject = new ConnectionParameters(encoded)
    assert.equal(subject.user, 'bi%na%%ry ')
    assert.equal(subject.password, 's@f#')
    assert.equal(subject.host, 'localhost')
    assert.equal(subject.database, ' u%20rl')
  })

  it('ssl is set on client (defaults)', () => {
    defaults.ssl = true
    const c = new Client('postgres://user:password@host/database')
    assert(c.ssl, 'Client should have ssl enabled via defaults')
  })

  it('coercing string "true" to boolean', () => {
    const subject = new ConnectionParameters({ ssl: 'true' })
    assert.strictEqual(subject.ssl, true)
  })

  it('ssl object passed through to libpq connection string', () => {
    const sourceConfig = {
      user: 'brian',
      password: 'hello<ther>e',
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      ssl: {
        sslmode: 'verify-ca',
        sslca: '/path/ca.pem',
        sslkey: '/path/cert.key',
        sslcert: '/path/cert.crt',
        sslrootcert: '/path/root.crt',
      },
    }
    defaults.ssl = true
    const c = new ConnectionParameters(sourceConfig)
    return new Promise<void>((resolve) => {
      c.getLibpqConnectionString((err, pgCString) => {
        assert(!err)
        assert.equal(
          (pgCString || '').indexOf("sslrootcert='/path/root.crt'") !== -1,
          true,
          'libpqConnectionString should contain sslrootcert'
        )
        resolve()
      })
    })
  })
})

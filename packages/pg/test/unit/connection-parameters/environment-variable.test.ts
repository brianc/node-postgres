import assert from 'node:assert'

import { afterAll, beforeAll, describe, it } from 'vitest'

import ConnectionParameters from '../../../src/connection-parameters.ts'
import defaults from '../../../src/defaults.ts'

const realEnv: Record<string, string> = {}

beforeAll(() => {
  for (const key in process.env) {
    realEnv[key] = process.env[key] as string
    delete process.env[key]
  }
})

afterAll(() => {
  for (const key in process.env) {
    delete process.env[key]
  }
  for (const key in realEnv) {
    process.env[key] = realEnv[key]
  }
})

const clearEnv = (): void => {
  for (const key in process.env) {
    delete process.env[key]
  }
}

describe('ConnectionParameters env', () => {
  it('initialized from environment variables', () => {
    clearEnv()
    process.env.PGHOST = 'local'
    process.env.PGUSER = 'bmc2'
    process.env.PGPORT = '7890'
    process.env.PGDATABASE = 'allyerbase'
    process.env.PGPASSWORD = 'open'

    const subject = new ConnectionParameters()
    assert.equal(subject.host, 'local')
    assert.equal(subject.user, 'bmc2')
    assert.equal(subject.port, 7890)
    assert.equal(subject.database, 'allyerbase')
    assert.equal(subject.password, 'open')
  })

  it('initialized from mix', () => {
    clearEnv()
    process.env.PGHOST = 'local'
    process.env.PGUSER = 'bmc2'
    process.env.PGPORT = '7890'
    process.env.PGDATABASE = 'allyerbase'
    process.env.PGPASSWORD = 'open'
    delete process.env.PGPASSWORD
    delete process.env.PGDATABASE
    const subject = new ConnectionParameters({ user: 'testing', database: 'zugzug' })
    assert.equal(subject.host, 'local')
    assert.equal(subject.user, 'testing')
    assert.equal(subject.port, 7890)
    assert.equal(subject.database, 'zugzug')
    assert.equal(subject.password, defaults.password)
  })

  it('connection string parsing', () => {
    clearEnv()
    const string = 'postgres://brian:pw@boom:381/lala'
    const subject = new ConnectionParameters(string)
    assert.equal(subject.host, 'boom')
    assert.equal(subject.user, 'brian')
    assert.equal(subject.password, 'pw')
    assert.equal(subject.port, 381)
    assert.equal(subject.database, 'lala')
  })

  it('connection string parsing - ssl', () => {
    clearEnv()

    let subject = new ConnectionParameters('postgres://brian:pw@boom:381/lala?ssl=true')
    assert.equal(subject.ssl, true)

    subject = new ConnectionParameters('postgres://brian:pw@boom:381/lala?ssl=1')
    assert.equal(subject.ssl, true)

    subject = new ConnectionParameters('postgres://brian:pw@boom:381/lala?other&ssl=true')
    assert.equal(subject.ssl, true)

    subject = new ConnectionParameters('postgres://brian:pw@boom:381/lala?ssl=0')
    assert.equal(!!subject.ssl, false)

    subject = new ConnectionParameters('postgres://brian:pw@boom:381/lala')
    assert.equal(!!subject.ssl, false)

    subject = new ConnectionParameters('postgres://brian:pw@boom:381/lala?ssl=no-verify')
    assert.deepStrictEqual(subject.ssl, { rejectUnauthorized: false })
  })

  it('ssl is false by default', () => {
    clearEnv()
    const subject = new ConnectionParameters()
    assert.equal(subject.ssl, false)
  })

  const sslCases: Array<[string, unknown]> = [
    ['', false],
    ['disable', false],
    ['allow', false],
    ['prefer', true],
    ['require', true],
    ['verify-ca', true],
    ['verify-full', true],
    ['no-verify', { rejectUnauthorized: false }],
  ]
  for (const [mode, expected] of sslCases) {
    it(`ssl is ${JSON.stringify(expected)} when $PGSSLMODE=${mode}`, () => {
      clearEnv()
      process.env.PGSSLMODE = mode
      const subject = new ConnectionParameters()
      assert.deepStrictEqual(subject.ssl, expected)
    })
  }
})

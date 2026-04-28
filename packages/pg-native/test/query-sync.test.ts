import assert from 'node:assert'
import { afterAll, beforeAll, describe, it } from 'vitest'
import Client from '../src/index.ts'

describe('query sync', () => {
  let client: Client

  beforeAll(() => {
    client = new Client()
    client.connectSync()
  })

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        client.end(() => resolve())
      })
  )

  it('simple query works', () => {
    const rows = client.querySync('SELECT NOW() AS the_time') as Array<Record<string, Date>>
    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.the_time!.getFullYear(), new Date().getFullYear())
  })

  it('parameterized query works', () => {
    const rows = client.querySync('SELECT $1::text AS name', ['Brian']) as Array<Record<string, string>>
    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.name, 'Brian')
  })

  it('throws when second argument is not an array', () => {
    assert.throws(() => {
      client.querySync('SELECT $1::text AS name', 'Brian' as unknown as unknown[])
    })
    assert.throws(() => {
      client.prepareSync('test-failure', 'SELECT $1::text as name', 1)
      client.executeSync('test-failure', 'Brian' as unknown as unknown[])
    })
  })

  it('prepared statement works', () => {
    client.prepareSync('test', 'SELECT $1::text as name', 1)

    const rows = client.executeSync('test', ['Brian']) as Array<Record<string, string>>
    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.name, 'Brian')

    const rows2 = client.executeSync('test', ['Aaron']) as Array<Record<string, string>>
    assert.equal(rows2.length, 1)
    assert.equal(rows2[0]!.name, 'Aaron')
  })

  it('prepare throws exception on error', () => {
    assert.throws(() => {
      client.prepareSync('blah', 'I LIKE TO PARTY!!!', 0)
    })
  })

  it('throws exception on executing improperly', () => {
    assert.throws(() => {
      // wrong number of parameters
      client.executeSync('test', [])
    })
  })

  it('throws exception on error', () => {
    assert.throws(() => {
      client.querySync('SELECT ASLKJASLKJF')
    })
  })

  it('is still usable after an error', () => {
    const rows = client.querySync('SELECT NOW()')
    assert(rows, 'should have returned rows')
    assert.equal(rows.length, 1)
  })

  it('supports empty query', () => {
    const rows = client.querySync('')
    assert(rows, 'should return rows')
    assert.equal(rows.length, 0, 'should return no rows')
  })
})

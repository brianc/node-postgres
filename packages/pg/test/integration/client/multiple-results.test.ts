import assert from 'node:assert'
import { describe, it } from 'vitest'
import helper from './_test-helper.ts'

describe('multiple result sets', () => {
  it('two select results work', async () => {
    const client = new helper.Client()
    await client.connect()

    const results = (await client.query(`SELECT 'foo'::text as name; SELECT 'bar'::text as baz`)) as unknown as Array<{
      fields: Array<{ name: string }>
      rows: Array<Record<string, unknown>>
    }>
    assert(Array.isArray(results))

    assert.equal(results[0].fields[0].name, 'name')
    assert.deepEqual(results[0].rows, [{ name: 'foo' }])

    assert.equal(results[1].fields[0].name, 'baz')
    assert.deepEqual(results[1].rows, [{ baz: 'bar' }])

    await client.end()
  })

  it('throws if queryMode set to "extended"', async () => {
    const client = new helper.Client()
    await client.connect()

    try {
      await client.query({
        text: `SELECT 'foo'::text as name; SELECT 'bar'::text as baz`,
        queryMode: 'extended',
      })
      assert.fail('Should have thrown')
    } catch (err) {
      if (err instanceof assert.AssertionError) throw err
      const e = err as { severity?: string; code?: string; message?: string }
      assert.equal(e.severity, 'ERROR')
      assert.equal(e.code, '42601')
      assert.equal(e.message, 'cannot insert multiple commands into a prepared statement')
    }

    await client.end()
  })

  it('multiple selects work', async () => {
    const client = new helper.Client()
    await client.connect()

    const text = `
  SELECT * FROM generate_series(2, 4) as foo;
  SELECT * FROM generate_series(8, 10) as bar;
  SELECT * FROM generate_series(20, 22) as baz;
  `

    const results = (await client.query(text)) as unknown as Array<{
      fields: Array<{ name: string }>
      rows: Array<Record<string, unknown>>
    }>
    assert(Array.isArray(results))

    assert.equal(results[0].fields[0].name, 'foo')
    assert.deepEqual(results[0].rows, [{ foo: 2 }, { foo: 3 }, { foo: 4 }])

    assert.equal(results[1].fields[0].name, 'bar')
    assert.deepEqual(results[1].rows, [{ bar: 8 }, { bar: 9 }, { bar: 10 }])

    assert.equal(results[2].fields[0].name, 'baz')
    assert.deepEqual(results[2].rows, [{ baz: 20 }, { baz: 21 }, { baz: 22 }])

    assert.equal(results.length, 3)

    await client.end()
  })

  it('mixed queries and statements', async () => {
    const client = new helper.Client()
    await client.connect()

    const text = `
  CREATE TEMP TABLE weather(type text);
  INSERT INTO weather(type) VALUES ('rain');
  SELECT * FROM weather;
  `

    const results = (await client.query(text)) as unknown as Array<{ command: string }>
    assert(Array.isArray(results))
    assert.equal(results[0].command, 'CREATE')
    assert.equal(results[1].command, 'INSERT')
    assert.equal(results[2].command, 'SELECT')

    await client.end()
  })
})

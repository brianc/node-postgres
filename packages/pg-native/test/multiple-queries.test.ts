import assert from 'node:assert'
import { afterAll, beforeAll, describe, it } from 'vitest'
import Client from '../src/index.ts'

describe('multiple commands in a single query', () => {
  let client: Client

  beforeAll(
    () =>
      new Promise<void>((resolve, reject) => {
        client = new Client()
        client.connect((err) => (err ? reject(err) : resolve()))
      })
  )

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        client.end(() => resolve())
      })
  )

  it('all execute to completion', () =>
    new Promise<void>((resolve, reject) => {
      client.query("SELECT '10'::int as num; SELECT 'brian'::text as name", (err, rows) => {
        if (err) return reject(err)
        const r = rows as Array<Array<Record<string, unknown>>>
        assert.equal(r.length, 2, 'should return two sets rows')
        assert.equal(r[0]![0]!.num, '10')
        assert.equal(r[1]![0]!.name, 'brian')
        resolve()
      })
    }))

  it('inserts and reads at once', () =>
    new Promise<void>((resolve, reject) => {
      let txt = 'CREATE TEMP TABLE boom(age int);'
      txt += 'INSERT INTO boom(age) VALUES(10);'
      txt += 'SELECT * FROM boom;'
      client.query(txt, (err, rows, results) => {
        if (err) return reject(err)
        const r = rows as Array<Array<Record<string, unknown>>>
        assert.equal(r.length, 3)
        assert.equal(r[0]!.length, 0)
        assert.equal(r[1]!.length, 0)
        assert.equal(r[2]![0]!.age, 10)

        const res = results as Array<{ command: string }>
        assert.equal(res[0]!.command, 'CREATE')
        assert.equal(res[1]!.command, 'INSERT')
        assert.equal(res[2]!.command, 'SELECT')
        resolve()
      })
    }))
})

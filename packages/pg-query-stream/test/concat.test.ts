import assert from 'node:assert'
import { Client } from 'pg'
import { afterEach, beforeEach, describe, it } from 'vitest'
import QueryStream from '../src/index.ts'

describe('concat', () => {
  let client: Client

  beforeEach(async () => {
    client = new Client()
    await client.connect()
  })

  afterEach(async () => {
    await client.end()
  })

  it('concats correctly', () =>
    new Promise<void>((resolve, reject) => {
      const stream = new QueryStream('SELECT * FROM generate_series(0, 200) num', [])
      const query = client.query(stream)
      const rows: Array<{ num: number }> = []
      query.on('data', (row: { num: number }) => rows.push(row))
      query.on('error', reject)
      query.on('end', () => {
        try {
          const total = rows.reduce((acc, row) => acc + Number(row.num), 0)
          assert.equal(total, 20100)
          assert.equal(rows.length, 201)
          resolve()
        } catch (err) {
          reject(err)
        }
      })
    }))
})

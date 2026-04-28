import assert from 'node:assert'
import { afterAll, beforeAll, describe, it } from 'vitest'
import Client from '../src/index.ts'

describe('COPY FROM', () => {
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

  it('works', () =>
    new Promise<void>((resolve) => {
      client.querySync('CREATE TEMP TABLE blah(name text, age int)')
      client.querySync('COPY blah FROM stdin')
      const stream = client.getCopyStream()
      stream.write(Buffer.from('Brian\t32\n', 'utf8'))
      stream.write(Buffer.from('Aaron\t30\n', 'utf8'))
      stream.write(Buffer.from('Shelley\t28\n', 'utf8'))
      stream.end()

      stream.once('finish', () => {
        const rows = client.querySync('SELECT COUNT(*) FROM blah') as Array<Record<string, unknown>>
        assert.equal(rows.length, 1)
        assert.equal(rows[0]!.count, 3)
        resolve()
      })
    }))

  it('works with a callback passed to end', () =>
    new Promise<void>((resolve) => {
      client.querySync('CREATE TEMP TABLE boom(name text, age int)')
      client.querySync('COPY boom FROM stdin')
      const stream = client.getCopyStream()
      stream.write(Buffer.from('Brian\t32\n', 'utf8'))
      stream.write(Buffer.from('Aaron\t30\n', 'utf8'), () => {
        stream.end(Buffer.from('Shelley\t28\n', 'utf8'), () => {
          const rows = client.querySync('SELECT COUNT(*) FROM boom') as Array<Record<string, unknown>>
          assert.equal(rows.length, 1)
          assert.equal(rows[0]!.count, 3)
          resolve()
        })
      })
    }))
})

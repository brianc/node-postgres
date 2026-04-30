import assert from 'node:assert'
import { afterAll, beforeAll, describe, it } from 'vitest'
import Client from '../src/index.ts'

// minimal stand-in for `concat-stream` to avoid extra dependencies
import { Writable } from 'node:stream'

function concat(cb: (buffer: Buffer) => void): Writable {
  const chunks: Buffer[] = []
  const w = new Writable({
    write(chunk: Buffer, _enc, done) {
      chunks.push(chunk)
      done()
    },
  })
  w.on('finish', () => cb(Buffer.concat(chunks)))
  return w
}

describe('async workflow', () => {
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

  function echoParams(params: string[]): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      client.query('SELECT $1::text as first, $2::text as second', params, (err, rows) => {
        if (err) return reject(err)
        const r = rows as Array<Record<string, unknown>>
        assert.equal(r.length, 1)
        assert.equal(r[0]!.first, params[0])
        assert.equal(r[0]!.second, params[1])
        resolve(r)
      })
    })
  }

  it('sends async query', async () => {
    await echoParams(['one', 'two'])
  })

  it('sends multiple async queries', async () => {
    await echoParams(['bang', 'boom'])
    await echoParams(['bang', 'boom'])
  })

  it('sends an async query, copies in, copies out, and sends another query', () =>
    new Promise<void>((resolve, reject) => {
      client.querySync('CREATE TEMP TABLE test(name text, age int)')
      client.query("INSERT INTO test(name, age) VALUES('brian', 32)", (err) => {
        if (err) return reject(err)
        client.querySync('COPY test FROM stdin')
        const input = client.getCopyStream()
        input.write(Buffer.from('Aaron\t30\n', 'utf8'))
        input.end(() => {
          client.query('SELECT COUNT(*) FROM test', (err2, rows) => {
            if (err2) return reject(err2)
            assert.equal((rows as unknown[]).length, 1)
            client.query('COPY test TO stdout', (err3) => {
              if (err3) return reject(err3)
              const output = client.getCopyStream()
              output.read()
              output.pipe(concat(() => resolve()))
            })
          })
        })
      })
    }))
})

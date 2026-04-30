import assert from 'node:assert'
import { Writable } from 'node:stream'
import { afterAll, beforeAll, describe, it } from 'vitest'
import Client from '../src/index.ts'

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

describe('COPY TO', () => {
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

  it('works - basic check', () =>
    new Promise<void>((resolve, reject) => {
      const limit = 1000
      const qText = 'COPY (SELECT * FROM generate_series(0, ' + (limit - 1) + ')) TO stdout'
      client.query(qText, (err) => {
        if (err) return reject(err)
        const stream = client.getCopyStream()
        stream.read()
        stream.pipe(
          concat((buff) => {
            const res = buff.toString('utf8')
            const expected = Array.from({ length: limit }, (_, i) => i.toString()).join('\n') + '\n'
            assert.equal(res, expected)
            resolve()
          })
        )
      })
    }))
})

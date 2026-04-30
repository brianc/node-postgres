import { Transform } from 'node:stream'
import concat from 'concat-stream'
import JSONStream from 'JSONStream'
import { it } from 'vitest'
import QueryStream from '../src/index.ts'
import helper from './_helper.ts'

class PauseStream extends Transform {
  constructor() {
    super({ objectMode: true })
  }

  override _transform(chunk: unknown, encoding: BufferEncoding, callback: () => void): void {
    this.push(chunk, encoding)
    setTimeout(callback, 1)
  }
}

helper('pauses', (client) => {
  it(
    'pauses',
    { timeout: 5000 },
    () =>
      new Promise<void>((resolve) => {
        const stream = new QueryStream('SELECT * FROM generate_series(0, $1) num', [200], {
          batchSize: 2,
          highWaterMark: 2,
        })
        const query = client.query(stream)
        const pauser = new PauseStream()
        query
          .pipe(JSONStream.stringify())
          .pipe(pauser)
          .pipe(
            concat((json: string) => {
              JSON.parse(json)
              resolve()
            })
          )
      })
  )
})

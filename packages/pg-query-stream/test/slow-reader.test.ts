import { Transform } from 'node:stream'
import concat from 'concat-stream'
import { it } from 'vitest'
import QueryStream from '../src/index.ts'
import helper from './_helper.ts'

const mapper = new Transform({ objectMode: true })

mapper._transform = function (obj, _enc, cb) {
  this.push(obj)
  setTimeout(cb, 5)
}

helper('slow reader', (client) => {
  it(
    'works',
    { timeout: 50000 },
    () =>
      new Promise<void>((resolve) => {
        const stream = new QueryStream('SELECT * FROM generate_series(0, 201) num', [], {
          highWaterMark: 100,
          batchSize: 50,
        })
        stream.on('end', () => {
          // console.log('stream end')
        })
        client.query(stream)
        stream.pipe(mapper).pipe(
          concat(() => {
            resolve()
          })
        )
      })
  )
})

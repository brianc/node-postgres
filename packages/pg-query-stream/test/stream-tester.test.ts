import spec from 'stream-spec'
import { it } from 'vitest'
import QueryStream from '../src/index.ts'
import helper from './_helper.ts'

helper('stream tester', (client) => {
  it('passes stream spec', () =>
    new Promise<void>((resolve) => {
      const stream = new QueryStream('SELECT * FROM generate_series(0, 200) num', [])
      const query = client.query(stream)
      spec(query).readable().pausable({ strict: true }).validateOnExit()
      stream.on('end', () => resolve())
    }))
})

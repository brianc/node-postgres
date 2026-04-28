import { it } from 'vitest'
import QueryStream from '../src/index.ts'
import helper from './_helper.ts'

helper('empty-query', (client) => {
  it('handles empty query', () =>
    new Promise<void>((resolve) => {
      const stream = new QueryStream('-- this is a comment', [])
      const query = client.query(stream)
      query
        .on('end', () => {
          // nothing should happen for empty query
          resolve()
        })
        .on('data', () => {
          // noop to kick off reading
        })
    }))

  it('continues to function after stream', () =>
    new Promise<void>((resolve, reject) => {
      client.query('SELECT NOW()', (err) => (err ? reject(err) : resolve()))
    }))
})

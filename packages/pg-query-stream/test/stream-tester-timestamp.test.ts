import assert from 'node:assert'
import spec from 'stream-spec'
import { it } from 'vitest'
import QueryStream from '../src/index.ts'
import helper from './_helper.ts'

helper('stream tester timestamp', (client) => {
  it('should not warn about max listeners', () =>
    new Promise<void>((resolve) => {
      const sql = "SELECT * FROM generate_series('1983-12-30 00:00'::timestamp, '2013-12-30 00:00', '1 years')"
      const stream = new QueryStream(sql, [])
      let ended = false
      const query = client.query(stream)
      query.on('end', () => {
        ended = true
      })
      spec(query).readable().pausable({ strict: true }).validateOnExit()
      const checkListeners = () => {
        assert(stream.listeners('end').length < 10)
        if (!ended) {
          setImmediate(checkListeners)
        } else {
          resolve()
        }
      }
      checkListeners()
    }))
})

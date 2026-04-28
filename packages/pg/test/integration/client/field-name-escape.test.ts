import { describe, it } from 'vitest'

import helper from './_test-helper.ts'

describe('field-name-escape', () => {
  it('escapes weird field names without injection', () =>
    new Promise<void>((resolve, reject) => {
      const sql = 'SELECT 1 AS "\\\'/*", 2 AS "\\\'*/\n + process.exit(-1)] = null;\n//"'

      const pg = helper.pg
      const client = new pg.Client()
      client.connect()
      client.query(sql, (err?: Error) => {
        if (err) {
          client.end()
          reject(err)
          return
        }
        client.end()
        resolve()
      })
    }))
})

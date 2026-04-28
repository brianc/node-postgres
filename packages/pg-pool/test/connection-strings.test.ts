import { describe, expect, it } from 'vitest'
import Pool from '../src/index.ts'

describe('Connection strings', () => {
  it('pool delegates connectionString property to client', () =>
    new Promise<void>((resolve) => {
      const connectionString = 'postgres://foo:bar@baz:1234/xur'

      const pool = new Pool({
        // use a fake client so we can check we're passed the connectionString
        Client: function (this: any, args: any) {
          expect(args.connectionString).toBe(connectionString)
          return {
            connect(cb: (err: Error) => void) {
              cb(new Error('testing'))
            },
            on() {},
          }
        } as any,
        connectionString: connectionString,
      })

      pool.connect((err) => {
        expect(err).not.toBe(undefined)
        resolve()
      })
    }))
})

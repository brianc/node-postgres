import { describe, it } from 'vitest'
import assert from 'node:assert'

describe('2307', () => {
  it('bad ssl credentials do not cause crash', async () => {
    const pg = (await import('../../../src/index.ts')).default
    const config = {
      ssl: {
        ca: 'invalid_value',
        key: 'invalid_value',
        cert: 'invalid_value',
      },
    }

    const client = new pg.Client(config)

    await new Promise<void>((done) => {
      client.connect((err: unknown) => {
        assert(err)
        client.end()
        done()
      })
    })
  })
})

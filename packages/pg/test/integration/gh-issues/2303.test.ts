import { describe, it } from 'vitest'
import helper from './../_test-helper.ts'
import assert from 'node:assert'
import * as util from 'node:util'

describe('2303', () => {
  const secret_value = 'FAIL THIS TEST'

  it('SSL Key should not exist in toString() output', () => {
    const pool = new helper.pg.Pool({ ssl: { key: secret_value } })
    const client = new helper.pg.Client({ ssl: { key: secret_value } })
    assert(pool.toString().indexOf(secret_value) === -1)
    assert(client.toString().indexOf(secret_value) === -1)
  })

  it('SSL Key should not exist in util.inspect output', () => {
    const pool = new helper.pg.Pool({ ssl: { key: secret_value } })
    const client = new helper.pg.Client({ ssl: { key: secret_value } })
    const depth = 20
    assert(util.inspect(pool, { depth }).indexOf(secret_value) === -1)
    assert(util.inspect(client, { depth }).indexOf(secret_value) === -1)
  })

  it('SSL Key should not exist in json.stringfy output', () => {
    const pool = new helper.pg.Pool({ ssl: { key: secret_value } })
    const client = new helper.pg.Client({ ssl: { key: secret_value } })
    assert(JSON.stringify(pool).indexOf(secret_value) === -1)
    assert(JSON.stringify(client).indexOf(secret_value) === -1)
  })

  it('SSL Key should exist for direct access', () => {
    const pool = new helper.pg.Pool({ ssl: { key: secret_value } })
    const client = new helper.pg.Client({ ssl: { key: secret_value } })
    assert((pool.options.ssl as { key: string }).key === secret_value)
    assert((client.connectionParameters.ssl as { key: string }).key === secret_value)
  })

  it('SSL Key should exist for direct access even when non-enumerable custom config', () => {
    const config = { ssl: { key: secret_value } }
    Object.defineProperty(config.ssl, 'key', { enumerable: false })
    const pool = new helper.pg.Pool(config)
    const client = new helper.pg.Client(config)
    assert((pool.options.ssl as { key: string }).key === secret_value)
    assert((client.connectionParameters.ssl as { key: string }).key === secret_value)
  })
})

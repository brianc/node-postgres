import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'

describe('custom-types', () => {
  const Client = helper.pg.Client

  const customTypes = {
    getTypeParser: () => () => 'okay!',
  }

  it('custom type parser in client config', () =>
    new Promise<void>((done) => {
      const client = new Client({ types: customTypes })

      client.connect().then(() => {
        client.query(
          'SELECT NOW() as val',
          assert.success(function (res) {
            assert.equal(res.rows[0].val, 'okay!')
            client.end().then(done)
          })
        )
      })
    }))

  it('custom type parser in client config with multiple results', () =>
    new Promise<void>((done) => {
      const client = new Client({ types: customTypes })

      client.connect().then(() => {
        client.query(
          `SELECT 'foo'::text as name; SELECT 'bar'::text as baz`,
          assert.success(function (res) {
            assert.equal(res[0].rows[0].name, 'okay!')
            assert.equal(res[1].rows[0].baz, 'okay!')
            client.end().then(done)
          })
        )
      })
    }))

  // Custom type-parsers per query are not supported in native
  if (!false) {
    it('custom type parser in query', () =>
      new Promise<void>((done) => {
        const client = new Client()

        client.connect().then(() => {
          client.query(
            {
              text: 'SELECT NOW() as val',
              types: customTypes,
            },
            assert.success(function (res) {
              assert.equal(res.rows[0].val, 'okay!')
              client.end().then(done)
            })
          )
        })
      }))
  }
})

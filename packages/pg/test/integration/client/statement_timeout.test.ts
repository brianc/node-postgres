import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'

describe('statement_timeout', () => {
  const Client = helper.Client

  const conInfo = helper.config

  function getConInfo(override) {
    return Object.assign({}, conInfo, override)
  }

  function getStatementTimeout(conf, cb) {
    const client = new Client(conf)
    client.connect(
      assert.success(function () {
        client.query(
          'SHOW statement_timeout',
          assert.success(function (res) {
            const statementTimeout = res.rows[0].statement_timeout
            cb(statementTimeout)
            client.end()
          })
        )
      })
    )
  }

  if (!false) {
    // statement_timeout is not supported with the native client
    it('No default statement_timeout ', () =>
      new Promise<void>((done) => {
        getConInfo()
        getStatementTimeout({}, function (res) {
          assert.strictEqual(res, '0') // 0 = no timeout
          done()
        })
      }))

    it('statement_timeout integer is used', () =>
      new Promise<void>((done) => {
        const conf = getConInfo({
          statement_timeout: 3000,
        })
        getStatementTimeout(conf, function (res) {
          assert.strictEqual(res, '3s')
          done()
        })
      }))

    it('statement_timeout float is used', () =>
      new Promise<void>((done) => {
        const conf = getConInfo({
          statement_timeout: 3000.7,
        })
        getStatementTimeout(conf, function (res) {
          assert.strictEqual(res, '3s')
          done()
        })
      }))

    it('statement_timeout string is used', () =>
      new Promise<void>((done) => {
        const conf = getConInfo({
          statement_timeout: '3000',
        })
        getStatementTimeout(conf, function (res) {
          assert.strictEqual(res, '3s')
          done()
        })
      }))

    it('statement_timeout actually cancels long running queries', () =>
      new Promise<void>((done) => {
        const conf = getConInfo({
          statement_timeout: '10', // 10ms to keep tests running fast
        })
        const client = new Client(conf)
        client.connect(
          assert.success(function () {
            client.query('SELECT pg_sleep( 1 )', function (error) {
              client.end()
              assert.strictEqual(error.code, '57014') // query_cancelled
              done()
            })
          })
        )
      }))
  }
})

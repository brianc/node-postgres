import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'

describe('idle_in_transaction_session_timeout', () => {
  const Client = helper.Client
  const conInfo = helper.config

  function getConInfo(override?: Record<string, unknown>): Record<string, unknown> {
    return Object.assign({}, conInfo, override)
  }

  function testClientVersion(cb: () => void): void {
    const client = new Client({})
    client.connect(
      assert.success(function () {
        helper.versionGTE(
          client,
          100000,
          assert.success(function (isGreater) {
            return client.end(
              assert.success(function () {
                if (!isGreater) {
                  console.log(
                    'skip idle_in_transaction_session_timeout at client-level is only available in v10 and above'
                  )
                  return
                }
                cb()
              })
            )
          })
        )
      })
    )
  }

  function getIdleTransactionSessionTimeout(conf: Record<string, unknown>, cb: (timeout: string) => void): void {
    const client = new Client(conf as never)
    client.connect(
      assert.success(function () {
        client.query(
          'SHOW idle_in_transaction_session_timeout',
          assert.success(function (res: { rows: Array<{ idle_in_transaction_session_timeout: string }> }) {
            const timeout = res.rows[0].idle_in_transaction_session_timeout
            cb(timeout)
            client.end()
          })
        )
      })
    )
  }

  if (!false) {
    // idle_in_transaction_session_timeout is not supported with the native client
    testClientVersion(function () {
      it('No default idle_in_transaction_session_timeout ', () =>
        new Promise<void>((done) => {
          getConInfo()
          getIdleTransactionSessionTimeout({}, function (res) {
            assert.strictEqual(res, '0') // 0 = no timeout
            done()
          })
        }))

      it('idle_in_transaction_session_timeout integer is used', () =>
        new Promise<void>((done) => {
          const conf = getConInfo({
            idle_in_transaction_session_timeout: 3000,
          })
          getIdleTransactionSessionTimeout(conf, function (res: string) {
            assert.strictEqual(res, '3s')
            done()
          })
        }))

      it('idle_in_transaction_session_timeout float is used', () =>
        new Promise<void>((done) => {
          const conf = getConInfo({
            idle_in_transaction_session_timeout: 3000.7,
          })
          getIdleTransactionSessionTimeout(conf, function (res: string) {
            assert.strictEqual(res, '3s')
            done()
          })
        }))

      it('idle_in_transaction_session_timeout string is used', () =>
        new Promise<void>((done) => {
          const conf = getConInfo({
            idle_in_transaction_session_timeout: '3000',
          })
          getIdleTransactionSessionTimeout(conf, function (res: string) {
            assert.strictEqual(res, '3s')
            done()
          })
        }))
    })
  }
})

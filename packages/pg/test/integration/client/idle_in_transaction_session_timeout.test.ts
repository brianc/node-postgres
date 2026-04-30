import { describe, it } from 'vitest'
import assert from 'node:assert'
import helper from './_test-helper.ts'

// idle_in_transaction_session_timeout requires postgres v10+. CI and the
// repo's docker-compose run pg 14+, so the version gate that the original
// test guarded with helper.versionGTE is now implicit. The native client
// path (also gated in the original) is excluded by the package's vitest
// config, which skips test/native entirely.

describe('idle_in_transaction_session_timeout', () => {
  const Client = helper.Client

  function getIdleTransactionSessionTimeout(
    conf: Record<string, unknown>,
    cb: (err: Error | undefined, timeout?: string) => void
  ): void {
    const client = new Client(conf as never)
    client.connect((err) => {
      if (err) return cb(err)
      client.query(
        'SHOW idle_in_transaction_session_timeout',
        (qErr: Error | undefined, res: { rows: Array<{ idle_in_transaction_session_timeout: string }> }) => {
          if (qErr) {
            client.end()
            return cb(qErr)
          }
          const timeout = res.rows[0].idle_in_transaction_session_timeout
          client.end(() => cb(undefined, timeout))
        }
      )
    })
  }

  it('No default idle_in_transaction_session_timeout', () =>
    new Promise<void>((done, reject) => {
      getIdleTransactionSessionTimeout({}, (err, timeout) => {
        if (err) return reject(err)
        try {
          assert.strictEqual(timeout, '0')
          done()
        } catch (e) {
          reject(e)
        }
      })
    }))

  it('idle_in_transaction_session_timeout integer is used', () =>
    new Promise<void>((done, reject) => {
      getIdleTransactionSessionTimeout({ idle_in_transaction_session_timeout: 3000 }, (err, timeout) => {
        if (err) return reject(err)
        try {
          assert.strictEqual(timeout, '3s')
          done()
        } catch (e) {
          reject(e)
        }
      })
    }))

  it('idle_in_transaction_session_timeout float is used', () =>
    new Promise<void>((done, reject) => {
      getIdleTransactionSessionTimeout({ idle_in_transaction_session_timeout: 3000.7 }, (err, timeout) => {
        if (err) return reject(err)
        try {
          assert.strictEqual(timeout, '3s')
          done()
        } catch (e) {
          reject(e)
        }
      })
    }))

  it('idle_in_transaction_session_timeout string is used', () =>
    new Promise<void>((done, reject) => {
      getIdleTransactionSessionTimeout({ idle_in_transaction_session_timeout: '3000' }, (err, timeout) => {
        if (err) return reject(err)
        try {
          assert.strictEqual(timeout, '3s')
          done()
        } catch (e) {
          reject(e)
        }
      })
    }))
})

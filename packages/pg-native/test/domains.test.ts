import assert from 'node:assert'
import domain from 'node:domain'
import { describe, it } from 'vitest'
import Client from '../src/index.ts'

function checkDomain(d: domain.Domain, when: string): void {
  const proc = process as unknown as { domain: domain.Domain | null }
  assert(proc.domain, 'Domain was lost after ' + when)
  assert.strictEqual(proc.domain, d, 'Domain switched after ' + when)
}

describe('domains', () => {
  it('remains bound after a query', () =>
    new Promise<void>((resolve) => {
      const d = domain.create()
      d.run(() => {
        const client = new Client()
        client.connect(() => {
          checkDomain(d, 'connection')
          client.query('SELECT NOW()', () => {
            checkDomain(d, 'query')
            client.prepare('testing', 'SELECT NOW()', 0, () => {
              checkDomain(d, 'prepare')
              client.execute('testing', [], () => {
                checkDomain(d, 'execute')
                client.end(() => {
                  checkDomain(d, 'end')
                  resolve()
                })
              })
            })
          })
        })
      })
    }))
})

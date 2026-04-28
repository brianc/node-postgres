import assert from 'node:assert'

import { describe, it } from 'vitest'

import { client } from './_test-helper.ts'

class Wait {
  promise: Promise<void>
  resolve!: () => void

  constructor() {
    this.promise = new Promise((resolve) => {
      this.resolve = resolve
    })
  }

  until(): Promise<void> {
    return this.promise
  }

  done(time?: number): void {
    if (time) {
      setTimeout(() => this.resolve(), time)
    } else {
      this.resolve()
    }
  }
}

describe('password callback', () => {
  it('called with connection params', async () => {
    const wait = new Wait()
    const c = client({
      user: 'foo',
      database: 'bar',
      host: 'baz',
      password: async (params) => {
        assert.equal(params.user, 'foo')
        assert.equal(params.database, 'bar')
        assert.equal(params.host, 'baz')
        wait.done(10)
        return 'password'
      },
    })
    c.connection.emit('authenticationCleartextPassword')
    await wait.until()
    assert.equal(c.user, 'foo')
    assert.equal(c.database, 'bar')
    assert.equal(c.host, 'baz')
    assert.equal(c.connectionParameters.password, 'password')
  })
})

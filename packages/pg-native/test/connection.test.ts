import assert from 'node:assert'
import { describe, it } from 'vitest'
import Client from '../src/index.ts'

describe('connection', () => {
  it('works', () =>
    new Promise<void>((resolve, reject) => {
      new Client().connect((err) => {
        if (err) return reject(err)
        resolve()
      })
    }))

  it('connects with args', () =>
    new Promise<void>((resolve, reject) => {
      new Client().connect(`host=${process.env.PGHOST || 'localhost'}`, (err) => {
        if (err) return reject(err)
        resolve()
      })
    }))

  it('errors out with bad connection args', () =>
    new Promise<void>((resolve) => {
      new Client().connect('host=asldkfjasdf', (err) => {
        assert(err, 'should raise an error for bad host')
        resolve()
      })
    }))
})

describe('connectSync', () => {
  it('works without args', () => {
    new Client().connectSync()
  })

  it('works with args', () => {
    const args = 'host=' + (process.env.PGHOST || 'localhost')
    new Client().connectSync(args)
  })

  it('throws if bad host', () => {
    assert.throws(() => {
      new Client().connectSync('host=laksdjfdsf')
    })
  })
})

describe('connection error', () => {
  it('doesnt segfault', () =>
    new Promise<void>((resolve) => {
      const client = new Client()
      client.connect('asldgsdgasgdasdg', (err) => {
        assert(err)
        // calling error on a closed client was segfaulting
        client.end()
        resolve()
      })
    }))
})

describe('reading while not connected', () => {
  it('does not seg fault but does throw exception', () => {
    const client = new Client()
    assert.throws(() => {
      client.on('notification', () => {})
    })
  })
})

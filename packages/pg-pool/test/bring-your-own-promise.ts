import BluebirdPromise from 'bluebird'
import Pool from '../'
import assert from 'assert'

const checkType = (promise) => {
  assert.ok(promise instanceof BluebirdPromise)
  return promise.catch((e) => undefined)
}

describe('Bring your own promise', function () {
  it('uses supplied promise for operations', async () => {
    const pool = new Pool({ Promise: BluebirdPromise })
    const client1 = await checkType(pool.connect())
    client1.release()
    await checkType(pool.query('SELECT NOW()'))
    const client2 = await checkType(pool.connect())
    // TODO - make sure pg supports BYOP as well
    client2.release()
    await checkType(pool.end())
  })

  it('uses promises in errors', async () => {
    const pool = new Pool({ Promise: BluebirdPromise, port: 48484 })
    await checkType(pool.connect())
    await checkType(pool.end())
    await checkType(pool.connect())
    await checkType(pool.query())
    await checkType(pool.end())
  })
})

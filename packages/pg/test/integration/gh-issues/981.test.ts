import { describe, it } from 'vitest'
import assert from 'node:assert'

// native bindings are only installed for native tests; this suite is gated
describe.skip('981', () => {
  it('js pool returns js client', async () => {
    const pg = (await import('../../../src/index.ts')).default
    const JsClient = (await import('../../../src/client.ts')).default
    const jsPool = new pg.Pool()
    await new Promise<void>((cb) => {
      jsPool.connect((_err: unknown, client: unknown, done: () => void) => {
        assert(client instanceof JsClient)
        done()
        jsPool.end(cb)
      })
    })
  })

  it('native pool returns native client', async () => {
    const pg = (await import('../../../src/index.ts')).default
    const native = pg.native
    const NativeClient = (await import('../../../src/native/client.ts')).default
    const nativePool = new native.Pool()
    await new Promise<void>((cb) => {
      nativePool.connect((_err: unknown, client: unknown, done: () => void) => {
        assert(client instanceof NativeClient)
        done()
        nativePool.end(cb)
      })
    })
  })
})

import { describe, it } from 'vitest'
import helper from './_test-helper.ts'
import assert from 'node:assert'

describe('appname', () => {
  const Client = helper.Client
  const conInfo = helper.config

  function getConInfo(override: Record<string, unknown>): Record<string, unknown> {
    return Object.assign({}, conInfo, override)
  }

  function getAppName(conf: string | Record<string, unknown>, cb: (appName: string) => void): void {
    const client = new Client(conf as never)
    client.connect(
      assert.success(function () {
        client.query(
          'SHOW application_name',
          assert.success(function (res: { rows: Array<{ application_name: string }> }) {
            const appName = res.rows[0].application_name
            cb(appName)
            client.end()
          })
        )
      })
    )
  }

  it('No default appliation_name ', () =>
    new Promise<void>((done) => {
      getAppName({}, function (res: string) {
        assert.strictEqual(res, '')
        done()
      })
    }))

  it('fallback_application_name is used', () =>
    new Promise<void>((done) => {
      const fbAppName = 'this is my app'
      const conf = getConInfo({
        fallback_application_name: fbAppName,
      })
      getAppName(conf, function (res: string) {
        assert.strictEqual(res, fbAppName)
        done()
      })
    }))

  it('application_name is used', () =>
    new Promise<void>((done) => {
      const appName = 'some wired !@#$% application_name'
      const conf = getConInfo({
        application_name: appName,
      })
      getAppName(conf, function (res: string) {
        assert.strictEqual(res, appName)
        done()
      })
    }))

  it('application_name has precedence over fallback_application_name', () =>
    new Promise<void>((done) => {
      const appName = 'some wired !@#$% application_name'
      const fbAppName = 'some other strange $$test$$ appname'
      const conf = getConInfo({
        application_name: appName,
        fallback_application_name: fbAppName,
      })
      getAppName(conf, function (res: string) {
        assert.strictEqual(res, appName)
        done()
      })
    }))

  it('application_name from connection string', () =>
    new Promise<void>((done) => {
      const appName = 'my app'
      const conf = 'postgres://?application_name=' + appName
      getAppName(conf, function (res: string) {
        assert.strictEqual(res, appName)
        done()
      })
    }))

  // TODO: make the test work for native client too
  if (!false) {
    it('application_name is read from the env', () =>
      new Promise<void>((done) => {
        const appName = (process.env.PGAPPNAME = 'testest')
        getAppName({}, function (res: string) {
          delete process.env.PGAPPNAME
          assert.strictEqual(res, appName)
          done()
        })
      }))
  }
})

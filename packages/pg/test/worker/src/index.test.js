if (parseInt(process.versions.node.split('.')[0]) < 20) {
  process.exit(0)
}
var helper = require('../../test-helper')
const path = require('path')
const { unstable_dev } = require('wrangler')

var suite = new helper.Suite()
const assert = require('assert')

suite.testAsync('Can run in Cloudflare Worker?', test())

async function test() {
  const worker = await unstable_dev(path.resolve(__dirname, './index.ts'), {
    config: path.resolve(__dirname, '../wrangler.toml'),
    vars: {
      ...process.env,
    },
    experimental: {
      experimentalLocal: true,
      disableExperimentalWarning: true,
    },
    logLevel: 'ERROR',
  })
  try {
    const resp = await worker.fetch('/')
    const { rows } = await resp.json()
    assert.same(rows[0].text, 'Hello, World!')
  } finally {
    await worker.stop()
  }
}

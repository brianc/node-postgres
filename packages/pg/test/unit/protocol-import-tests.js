'use strict'

const assert = require('assert')
const fs = require('fs')
const helper = require('./test-helper')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

const connectionSource = fs.readFileSync(require.resolve('../../lib/connection'), 'utf8')
const indexSource = fs.readFileSync(require.resolve('../../lib'), 'utf8')

test('uses the exported pg-protocol CommonJS entrypoint', function () {
  require.resolve('pg-protocol/dist/index.js')
  assert.match(connectionSource, /require\('pg-protocol\/dist\/index\.js'\)/)
  assert.match(indexSource, /require\('pg-protocol\/dist\/index\.js'\)/)
})

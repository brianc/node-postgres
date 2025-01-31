const Client = require('../')
const assert = require('assert')
const semver = require('semver')

describe('version', function () {
  it('is exported', function () {
    assert(Client.version)
    assert.equal(require('../package.json').version, Client.version)
    assert(semver.gt(Client.version, '1.4.0'))
  })
})

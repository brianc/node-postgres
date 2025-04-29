const assert = require('assert'),
  path = require('path'),
  helper = require(path.join('..', 'lib', 'helper'))
describe('#17 when env is empty', function () {
  const fakeEnv = {}

  describe('getting the pgpass filename', function () {
    const checkFileName = function (expected) {
      assert.doesNotThrow(function () {
        const actual = helper.getFileName(fakeEnv)
        assert.equal(actual, expected)
      })
    }

    describe('on unix-ish envs', function () {
      it('should not fail', function () {
        checkFileName('.pgpass')
      })
    })

    describe('on windows', function () {
      before(function () {
        helper.isWin = true
      })
      after(function () {
        helper.isWin = process.platform === 'win32'
      })

      it('should not fail', function () {
        checkFileName(path.join('postgresql', 'pgpass.conf'))
      })
    })
  })
})

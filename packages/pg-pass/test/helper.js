const assert = require('assert'),
  path = require('path'),
  helper = require(path.join('..', 'lib', 'helper')),
  util = require('util'),
  Stream = require('resumer')
describe('#warnTo()', function () {
  it('should be process.stderr by default', function () {
    const stdErr = process.stderr
    const org = helper.warnTo(stdErr)
    assert(org === stdErr)
  })

  it('should not cause problems to give a non-stream', function () {
    const orgStream = helper.warnTo(null)
    assert(false === helper.usePgPass({ mode: 6 }))
    helper.warnTo(orgStream)
  })

  it('should write warnings to our writable stream', function (done) {
    const stream = new Stream()

    const orgStream = helper.warnTo(stream)
    const orgIsWin = helper.isWin
    helper.isWin = false

    assert(process.stderr === orgStream)
    assert(false === helper.usePgPass({ mode: 6 }))

    stream.on('data', function (d) {
      assert(0 === d.indexOf('WARNING: password file "<unkn>" is not a plain file'))

      helper.orgisWin = orgIsWin
      helper.warnTo(orgStream)
      stream.end()

      done()
    })
  })
})

describe('#getFileName()', function () {
  it('should return the default pgpass file', function () {
    const env = {
      HOME: '/tmp',
      APPDATA: 'C:\\tmp',
    }
    assert.equal(
      helper.getFileName(env),
      process.platform === 'win32' ? 'C:\\tmp\\postgresql\\pgpass.conf' : '/tmp/.pgpass'
    )
  })

  it('should return the the path to PGPASSFILE if set', function () {
    const env = {}
    const something = (env.PGPASSFILE = 'xxx')
    assert.equal(helper.getFileName(env), something)
  })
})

describe('#isWin', function () {
  it('should represent the platform and can be changed', function () {
    const orgIsWin = helper.isWin
    const test = 'something'
    const isWin = process.platform === 'win32'

    assert.equal(isWin, helper.isWin)

    helper.isWin = test
    assert.equal(test, helper.isWin)

    helper.isWin = orgIsWin
    assert.equal(isWin, helper.isWin)
  })
})

describe('#usePgPass()', function () {
  // http://lxr.free-electrons.com/source/include/uapi/linux/stat.h
  const testResults = {
    '0100660': false,
    '0100606': false,
    '0100100': true,
    '0100600': true,
    '0040600': false, // is a directory
    '0060600': false, // is a blockdevice
  }

  const org = helper.isWin // pretend we are UNIXish for permission tests
  helper.isWin = true
  Object.keys(testResults).forEach(function (octPerm) {
    const decPerm = Number(parseInt(octPerm, 8))
    const res = testResults[octPerm]
    const msg = util.format('should consider permission %s %s', octPerm, res ? 'secure' : 'not secure')

    it(msg, function () {
      assert.equal(helper.usePgPass({ mode: decPerm }) === res, true)
    })
  })
  helper.isWin = org

  it('should always return false if PGPASSWORD is set', function () {
    process.env.PGPASSWORD = 'some'
    assert(false === helper.usePgPass())
    delete process.env.PGPASSWORD
  })

  it('should always return true on windows', function () {
    const org = helper.isWin
    helper.isWin = true
    assert(helper.usePgPass())
    helper.isWin = org
  })
})

describe('#parseLine()', function () {
  it('should parse a simple line', function () {
    const res = helper.parseLine('host:port:dbase:user:pass')

    assert.deepEqual(res, {
      host: 'host',
      port: 'port',
      database: 'dbase',
      user: 'user',
      password: 'pass',
    })
  })

  it('should handle comments', function () {
    const res = helper.parseLine('  # some random comment')
    assert.equal(res, null)
  })

  it("should handle escaped ':' and '\\' right", function () {
    /* jshint -W044 */
    const res = helper.parseLine('some\\:host:port:some\\\\database:some;user:somepass')
    /* jshint +W044 */
    assert.deepEqual(res, {
      host: 'some:host',
      port: 'port',
      database: 'some\\database',
      /* jshint -W044 */
      user: 'some;user',
      /* jshint +W044 */
      password: 'somepass',
    })
  })

  it('should ignore too short lines', function () {
    const tests = ['::::', 'host:port', 'host:port:database', 'host:port:database:']

    tests.forEach(function (line) {
      const res = helper.parseLine(line)
      assert.equal(null, res)
    })
  })
})

describe('#isValidEntry()', function () {
  it("shouldn't report valid entries", function () {
    assert(
      helper.isValidEntry({
        host: 'some:host',
        port: 100,
        database: 'some\\database',
        /* jshint -W044 */
        user: 'some;user',
        /* jshint +W044 */
        password: 'somepass',
      })
    )
    assert(
      helper.isValidEntry({
        host: '*',
        port: '*',
        database: '*',
        user: '*',
        password: 'somepass',
      })
    )
  })

  it('should find invalid entries', function () {
    assert(
      !helper.isValidEntry({
        host: '',
      })
    )
    assert(
      !helper.isValidEntry({
        host: 'host',
        port: '100',
        database: 'database',
        user: 'user',
      })
    )
    assert(
      !helper.isValidEntry({
        host: 'host',
        port: -100,
        database: 'database',
        user: 'user',
        password: '232323',
      })
    )
  })
})

describe('#getPassword()', function () {
  const creds = 'host1:100:database1:user1:thepassword1' + '\n' + '*:*:database2:*:thepassword2' + '\n'
  const conn1 = {
    host: 'host1',
    port: 100,
    database: 'database1',
    user: 'user1',
  }
  const conn3 = {
    host: 'host3',
    database: 'database3',
    user: 'user3',
  }

  it('should not get password for non-matching conn_info', function (done) {
    const st = new Stream()

    helper.getPassword(conn3, st, function (pass) {
      assert.deepEqual(pass, undefined)
      done()
    })

    st.write(creds)
    st.end()
  })

  it('should get password for matching conn_info', function (done) {
    const st = new Stream()

    helper.getPassword(conn1, st, function (pass) {
      assert.notDeepEqual(pass, undefined)
      done()
    })

    st.write(creds)
    st.end()
  })

  it('should ignore no password on any error', function (done) {
    const st = new Stream()

    helper.getPassword({}, st, function (pass) {
      assert.deepEqual(pass, undefined)
      done()
    })

    st.emit('error', new Error('just some error'))
    st.end()
  })
})

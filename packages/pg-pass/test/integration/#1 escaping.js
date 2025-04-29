const RND = Math.random()
const USER = 'pgpass-test-some:user:'.concat(RND)
const PASS = 'pgpass-test-some:pass:'.concat(RND)
const POSTGRES_USER = process.env.POSTGRES_USER || 'postgres'
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'postgres'
const TEST_QUERY = 'SELECT CURRENT_USER AS me'

const assert = require('assert')
const spawn = require('child_process').spawn
const fs = require('fs')
const esc = require('pg-escape')
const tmp = require('tmp')

// cleanup temp file
tmp.setGracefulCleanup()

/**
 * Run connection test with
 *   - natvie clien
 *   - JS client
 *   - psql
 */
if (process.env.RUN_INTEGRATION_TESTS) {
  describe('using same password file', function () {
    before(pre)
    after(delUser)

    const config = {
      user: USER,
      database: 'postgres',
    }

    // load the module after setting up PGPASSFILE
    const pg = require('pg')
    const pgClient = new pg.Pool(config)
    const pgNativeClient = new pg.native.Pool(config)

    it('the JS client can connect', function (done) {
      pgClient.connect(checkConnection.bind(null, done))
    })

    it('the native client can connect', function (done) {
      pgNativeClient.connect(checkConnection.bind(null, done))
    })

    it('the psql client can connect', function (done) {
      runPsqlCmd(
        TEST_QUERY,
        function (err, res) {
          checkQueryRes(err, res.replace(/\n$/, ''))
          done()
        },
        USER
      )
    })
  })
}

/**
 * Did running the query return an error and is the result as expected?
 */
function checkQueryRes(err, res) {
  assert.ifError(err)
  assert.strictEqual(USER, res)
}

/**
 * Check the connection with node-postgres
 */
function checkConnection(testDone, err, client, pgDone) {
  assert.ifError(err)

  client.query(TEST_QUERY, function (err, res) {
    checkQueryRes(err, res.rows[0].me)
    pgDone()
    testDone()
  })
}

/**
 * Run test setup tasks
 */
function pre(cb) {
  genUser(function (err) {
    if (err) {
      delUser(function () {
        throw err
      })
    } else {
      setupPassFile(cb)
    }
  })
}

/**
 * Escape ':' and '\' before writing the password file
 */
function pgEsc(str) {
  return str.replace(/([:\\])/g, '\\$1')
}

/**
 * Write the temp. password file and setup the env var
 */
function setupPassFile(cb) {
  // 384 == 0600
  tmp.file({ mode: 384 }, function (err, path, fd) {
    if (err) {
      return cb(err)
    }

    const str = '*:*:*:__USER__:__PASS__'.replace('__USER__', pgEsc(USER)).replace('__PASS__', pgEsc(PASS))
    const buf = Buffer.from(str)

    fs.write(fd, buf, 0, buf.length, 0, function (err) {
      if (err) {
        return cb(err)
      }

      process.env.PGPASSFILE = path
      cb()
    })
  })
}

/**
 * generate a new user with password using psql
 */
function genUser(cb) {
  const cmd = esc('CREATE USER %I WITH PASSWORD %L', USER, PASS)
  runPsqlCmd(cmd, cb, POSTGRES_USER, POSTGRES_PASSWORD)
}

/**
 * delete the user using psql
 */
function delUser(cb) {
  const cmd = esc('DROP USER %I', USER)
  runPsqlCmd(cmd, cb, POSTGRES_USER, POSTGRES_PASSWORD)
}

/**
 * run a SQL command with psql
 */
function runPsqlCmd(cmd, cb, user, pass) {
  const env = Object.assign({}, process.env)
  if (pass) {
    env.PGPASSWORD = pass
  }

  // the user running the tests needs to be able to connect to
  // postgres as user 'postgres' without a password
  const psql = spawn('psql', ['-A', '-t', '-h', '127.0.0.1', '-d', 'postgres', '-U', user || 'postgres', '-c', cmd], {
    env: env,
  })

  let out = ''

  psql.stdout.on('data', function (data) {
    out += data.toString()
  })

  psql.on('exit', function (code) {
    cb(code === 0 ? null : code, out)
  })

  psql.stderr.on('data', function (err) {
    console.log('ERR:', err.toString())
  })
}

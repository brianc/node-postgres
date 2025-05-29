'use strict'
const co = require('co')
const expect = require('expect.js')

const describe = require('mocha').describe
const it = require('mocha').it
const { fork } = require('child_process')
const path = require('path')

const Pool = require('../')

const wait = (time) => new Promise((resolve) => setTimeout(resolve, time))

describe('idle timeout', () => {
  it('should timeout and remove the client', (done) => {
    const pool = new Pool({ idleTimeoutMillis: 10 })
    pool.query('SELECT NOW()')
    pool.on('remove', () => {
      expect(pool.idleCount).to.equal(0)
      expect(pool.totalCount).to.equal(0)
      done()
    })
  })

  it(
    'times out and removes clients when others are also removed',
    co.wrap(function* () {
      const pool = new Pool({ idleTimeoutMillis: 10 })
      const clientA = yield pool.connect()
      const clientB = yield pool.connect()
      clientA.release() // this will put clientA in the idle pool
      clientB.release(new Error()) // an error will cause clientB to be removed immediately

      const removal = new Promise((resolve) => {
        pool.on('remove', (client) => {
          // clientB's stream may take a while to close, so we may get a remove
          // event for it
          // we only want to handle the remove event for clientA when it times out
          // due to being idle
          if (client !== clientA) {
            return
          }

          expect(pool.idleCount).to.equal(0)
          expect(pool.totalCount).to.equal(0)
          resolve()
        })
      })

      const timeout = wait(100).then(() => Promise.reject(new Error('Idle timeout failed to occur')))

      try {
        yield Promise.race([removal, timeout])
      } finally {
        pool.end()
      }
    })
  )

  it(
    'can remove idle clients and recreate them',
    co.wrap(function* () {
      const pool = new Pool({ idleTimeoutMillis: 1 })
      const results = []
      for (let i = 0; i < 20; i++) {
        const query = pool.query('SELECT NOW()')
        expect(pool.idleCount).to.equal(0)
        expect(pool.totalCount).to.equal(1)
        results.push(yield query)
        yield wait(2)
        expect(pool.idleCount).to.equal(0)
        expect(pool.totalCount).to.equal(0)
      }
      expect(results).to.have.length(20)
    })
  )

  it(
    'does not time out clients which are used',
    co.wrap(function* () {
      const pool = new Pool({ idleTimeoutMillis: 1 })
      const results = []
      for (let i = 0; i < 20; i++) {
        const client = yield pool.connect()
        expect(pool.totalCount).to.equal(1)
        expect(pool.idleCount).to.equal(0)
        yield wait(10)
        results.push(yield client.query('SELECT NOW()'))
        client.release()
        expect(pool.idleCount).to.equal(1)
        expect(pool.totalCount).to.equal(1)
      }
      expect(results).to.have.length(20)
      return pool.end()
    })
  )

  it('unrefs the connections and timeouts so the program can exit when idle when the allowExitOnIdle option is set', function (done) {
    const child = fork(path.join(__dirname, 'idle-timeout-exit.js'), [], {
      stdio: ['ignore', 'pipe', 'inherit', 'ipc'],
      env: { ...process.env, ALLOW_EXIT_ON_IDLE: '1' },
    })
    let result = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => (result += chunk))
    child.on('error', (err) => done(err))
    child.on('exit', (exitCode) => {
      expect(exitCode).to.equal(0)
      expect(result).to.equal('completed first\ncompleted second\n')
      done()
    })
  })

  it('keeps old behavior when allowExitOnIdle option is not set', function (done) {
    const child = fork(path.join(__dirname, 'idle-timeout-exit.js'), [], {
      stdio: ['ignore', 'pipe', 'inherit', 'ipc'],
    })
    let result = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => (result += chunk))
    child.on('error', (err) => done(err))
    child.on('exit', (exitCode) => {
      expect(exitCode).to.equal(0)
      expect(result).to.equal('completed first\ncompleted second\nremoved\n')
      done()
    })
  })
})

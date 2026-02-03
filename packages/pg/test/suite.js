'use strict'

const async = require('async')
const { deprecate } = require('util')

const deprecatedTestAsync = deprecate(function (name, cb) {
  this.test(name, cb)
}, 'Suite#testAsync is deprecated. Use Suite#test instead - it handles promises & async functions just fine.')

class Test {
  constructor(name, cb) {
    this.name = name
    this.action = cb
    this.timeout = 5000
  }

  run(cb) {
    try {
      this._run(cb)
    } catch (e) {
      cb(e)
    }
  }

  _run(cb) {
    if (!this.action) {
      console.log(`${this.name} skipped`)
      return cb()
    }
    if (!this.action.length) {
      const result = this.action.call(this)
      if (!(result || 0).then) {
        return cb()
      }
      result.then(() => cb()).catch((err) => cb(err || new Error('Unhandled promise rejection')))
    } else {
      this.action(cb)
    }
  }
}

class Suite {
  constructor(name) {
    console.log('')
    this._queue = async.queue(this.run.bind(this), 1)
    this._queue.drain = () => {}
  }

  run(test, cb) {
    process.stdout.write('  ' + test.name + ' ')
    if (!test.action) {
      process.stdout.write('? - SKIPPED\n')
      return cb()
    }

    const tid = setTimeout(() => {
      const err = Error(`test: ${test.name} did not complete withint ${test.timeout}ms`)
      console.log('\n' + err.stack)
      process.exit(-1)
    }, test.timeout)

    test.run((err) => {
      clearTimeout(tid)
      if (err) {
        process.stdout.write(`FAILED!\n\n${err.stack}\n`)
        process.exit(-1)
      } else {
        process.stdout.write('✔\n')
        cb()
      }
    })
  }

  test(name, cb) {
    const test = new Test(name, cb)
    this._queue.push(test)
  }

  testAsync(name, cb) {
    return deprecatedTestAsync.call(this, name, cb)
  }
}

process.on('unhandledRejection', (e) => {
  setImmediate(() => {
    console.error('Unhandled promise rejection')
    throw e
  })
})

module.exports = Suite

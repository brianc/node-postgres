'use strict';

const async = require('async')

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
      if ((result || 0).then) {
        result
          .then(() => cb())
          .catch(err => cb(err || new Error('Unhandled promise rejection')))
      }
    } else {
      this.action.call(this, cb)
    }
  }
}

class Suite {
  constructor(name) {
    console.log('')
    this._queue = async.queue(this.run.bind(this), 1)
    this._queue.drain = () => { }
  }

  run(test, cb) {
    process.stdout.write(test.name + ' ')
    if (!test.action) {
      process.stdout.write('? - SKIPPED')
      return cb()
    }

    const tid = setTimeout(() => {
      const err = Error(`test: ${test.name} did not complete withint ${test.timeout}ms`)
      cb(err)
    }, test.timeout)

    test.run((err) => {
      clearTimeout(tid)
      if (err) {
        process.stdout.write(`FAILED!\n\n${err.stack}\n`)
        process.exit(-1)
      } else {
        process.stdout.write('✔\n')
      }
      cb(err)
    })
  }

  test(name, cb) {
    this._queue.push(new Test(name, cb))
  }
}

module.exports = Suite

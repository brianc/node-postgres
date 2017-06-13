const async = require('async')
const helper = require('./test-helper')
const pg = helper.pg;

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
  constructor() {
    console.log('')
    this._queue = async.queue(this.run.bind(this), 1)
    this._queue.drain = () => { }
  }

  run(test, cb) {
    const tid = setTimeout(() => {
      const err = Error(`test: ${test.name} did not complete withint ${test.timeout}ms`)
      cb(err)
    }, test.timeout)
    test.run((err) => {
      clearTimeout(tid)
      if (err) {
        console.log(test.name + ' FAILED!', err.stack)
      } else {
        console.log(test.name)
      }
      cb(err)
    })
  }

  test(name, cb) {
    this._queue.push(new Test(name, cb))
  }
}

const suite = new Suite()

suite.test('valid connection completes promise', () => {
  const client = new pg.Client()
  return client.connect()
    .then(() => {
      return client.end()
        .then(() => { })
    })
})

suite.test('valid connection completes promise', () => {
  const client = new pg.Client()
  return client.connect()
    .then(() => {
      return client.end()
        .then(() => { })
    })
})


suite.test('invalid connection rejects promise', (done) => {
  const client = new pg.Client({ host: 'alksdjflaskdfj' })
  return client.connect()
    .catch(e => {
      assert(e instanceof Error)
      done()
    })
})

suite.test('connected client does not reject promise after', (done) => {
  const client = new pg.Client()
  return client.connect()
    .then(() => {
      setTimeout(() => {
        // manually kill the connection
        client.connection.stream.end()
      }, 50)
    })
})

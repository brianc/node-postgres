'use strict'

const assert = require('assert')
const Pool = require('../')
const expect = require('expect.js')

let connectionAttempts = 0

// Test Client that simulates always timeout
class TimeoutClient {
  constructor() {}

  connect(cb) {
    connectionAttempts++
    setTimeout(() => {
      const err = new Error('timeout')
      err.code = 'ETIMEDOUT'
      cb(err)
    }, 10)
  }

  end() {
    // No-op for event handling
  }

  on(event, listener) {
    // No-op for event handling
  }

  removeListener(event, listener) {
    // No-op for event handling
  }
}

// Test Client that simulates two timeout then connects successfully
class TimeoutTwiceClient extends TimeoutClient {
  constructor() {
    super()
    this.timeout = true
    this.ended = false
  }

  connect(cb) {
    if (connectionAttempts++ > 1) {
      this.timeout = false
    }
    if (this.timeout) {
      setTimeout(() => {
        const err = new Error('timeout')
        err.code = 'ETIMEDOUT'
        cb(err)
      }, 10)
    } else {
      cb()
    }
  }

  end() {
    this.ended = true
  }
}

describe('retry on timeout', () => {
  beforeEach(() => {
    connectionAttempts = 0
  })

  it('should retry when client connection times out', function (done) {
    const pool = new Pool({
      Client: TimeoutTwiceClient,
      max: 1,
      connectionTimeoutMillis: 5,
      retryOnTimeout: true,
      maxRetries: 3,
      retryDelay: 15,
    })

    pool.connect((err, client, release) => {
      expect(err).to.be(undefined)
      expect(client).to.be.an(TimeoutTwiceClient)
      assert.equal(connectionAttempts, 3, 'should have tried 3 times')
      release()
      done()
    })
  })

  it('should fail after max retries', function (done) {
    const pool = new Pool({
      Client: TimeoutClient,
      max: 1,
      connectionTimeoutMillis: 5,
      retryOnTimeout: true,
      maxRetries: 3,
      retryDelay: 15,
    })

    pool.connect((err, client, release) => {
      expect(err).to.be.an(Error)
      expect(err.message).to.equal('Connection terminated due to connection timeout')
      expect(client).to.be(undefined)
      assert.equal(connectionAttempts, 4, 'should have tried 4 times (first attempt + 3 retries)')
      release()
      done()
    })
  })

  it('should not retry when retryOnTimeout is false', function (done) {
    const pool = new Pool({
      Client: TimeoutClient,
      max: 1,
      connectionTimeoutMillis: 5,
      retryOnTimeout: false,
    })

    pool.connect((err, client, release) => {
      expect(err).to.be.an(Error)
      expect(err.message).to.equal('Connection terminated due to connection timeout')
      expect(client).to.be(undefined)
      assert.equal(connectionAttempts, 1, 'should have tried only once without retries')
      release()
      done()
    })
  })
})

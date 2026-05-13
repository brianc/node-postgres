const assert = require('assert')
const Client = require('../')
const concat = require('concat-stream')
const _ = require('lodash')

describe('COPY TO', function () {
  before(function (done) {
    this.client = Client()
    this.client.connect(done)
  })

  after(function (done) {
    this.client.end(done)
  })

  it('works - basic check', function (done) {
    const limit = 1000
    const qText = 'COPY (SELECT * FROM generate_series(0, ' + (limit - 1) + ')) TO stdout'
    const self = this
    this.client.query(qText, function (err) {
      if (err) return done(err)
      const stream = self.client.getCopyStream()
      // pump the stream for node v0.11.x
      stream.read()
      stream.pipe(
        concat(function (buff) {
          const res = buff.toString('utf8')
          const expected = _.range(0, limit).join('\n') + '\n'
          assert.equal(res, expected)
          done()
        })
      )
    })
  })
})

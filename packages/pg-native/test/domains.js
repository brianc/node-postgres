const Client = require('../')
const assert = require('assert')

const checkDomain = function (domain, when) {
  assert(process.domain, 'Domain was lost after ' + when)
  assert.strictEqual(process.domain, domain, 'Domain switched after ' + when)
}

describe('domains', function () {
  it('remains bound after a query', function (done) {
    const domain = require('domain').create()
    domain.run(function () {
      const client = new Client()
      client.connect(function () {
        checkDomain(domain, 'connection')
        client.query('SELECT NOW()', function () {
          checkDomain(domain, 'query')
          client.prepare('testing', 'SELECT NOW()', 0, function () {
            checkDomain(domain, 'prepare')
            client.execute('testing', [], function () {
              checkDomain(domain, 'execute')
              client.end(function () {
                checkDomain(domain, 'end')
                done()
              })
            })
          })
        })
      })
    })
  })
})

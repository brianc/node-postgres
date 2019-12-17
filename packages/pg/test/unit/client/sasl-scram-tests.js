'use strict'
require('./test-helper');

var sasl = require('../../../lib/sasl')

test('sasl/scram', function () {

  test('startSession', function () {

    test('fails when mechanisms does not include SCRAM-SHA-256', function () {
      assert.throws(function () {
        sasl.startSession([])
      }, {
        message: 'SASL: Only mechanism SCRAM-SHA-256 is currently supported',
      })
    })

    test('returns expected session data', function () {
      const session = sasl.startSession(['SCRAM-SHA-256'])

      assert.equal(session.mechanism, 'SCRAM-SHA-256')
      assert.equal(String(session.clientNonce).length, 24)
      assert.equal(session.message, 'SASLInitialResponse')

      assert(session.response.match(/^n,,n=\*,r=.{24}/))
    })

    test('creates random nonces', function () {
      const session1 = sasl.startSession(['SCRAM-SHA-256'])
      const session2 = sasl.startSession(['SCRAM-SHA-256'])

      assert(session1.clientNonce != session2.clientNonce)
    })

  })

  test('continueSession', function () {

    test('fails when last session message was not SASLInitialResponse', function () {
      assert.throws(function () {
        sasl.continueSession({})
      }, {
        message: 'SASL: Last message was not SASLInitialResponse',
      })
    })

    test('fails when nonce is missing in server message', function () {
      assert.throws(function () {
        sasl.continueSession({
          message: 'SASLInitialResponse',
        }, "s=1,i=1")
      }, {
        message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing',
      })
    })

    test('fails when salt is missing in server message', function () {
      assert.throws(function () {
        sasl.continueSession({
          message: 'SASLInitialResponse',
        }, "r=1,i=1")
      }, {
        message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing',
      })
    })

    test('fails when iteration is missing in server message', function () {
      assert.throws(function () {
        sasl.continueSession({
          message: 'SASLInitialResponse',
        }, "r=1,s=1")
      }, {
        message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration missing',
      })
    })

    test('fails when server nonce does not start with client nonce', function () {
      assert.throws(function () {
        sasl.continueSession({
          message: 'SASLInitialResponse',
          clientNonce: '2',
        }, 'r=1,s=1,i=1')
      }, {
        message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce',
      })
    })

    test('sets expected session data', function () {
      const session = {
        message: 'SASLInitialResponse',
        clientNonce: 'a',
      };

      sasl.continueSession(session, 'password', 'r=ab,s=x,i=1')

      assert.equal(session.message, 'SASLResponse')
      assert.equal(session.serverSignature, 'TtywIrpWDJ0tCSXM2mjkyiaa8iGZsZG7HllQxr8fYAo=')

      assert.equal(session.response, 'c=biws,r=ab,p=KAEPBUTjjofB0IM5UWcZApK1dSzFE0o5vnbWjBbvFHA=')
    })

  })

  test('continueSession', function () {

    test('fails when last session message was not SASLResponse', function () {
      assert.throws(function () {
        sasl.finalizeSession({})
      }, {
        message: 'SASL: Last message was not SASLResponse',
      })
    })

    test('fails when server signature does not match', function () {
      assert.throws(function () {
        sasl.finalizeSession({
          message: 'SASLResponse',
          serverSignature: '3',
        }, "v=4")
      }, {
        message: 'SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature does not match',
      })
    })

    test('does not fail when eveything is ok', function () {
      sasl.finalizeSession({
        message: 'SASLResponse',
        serverSignature: '5',
      }, "v=5")
    })

  })

})


'use strict'
const helper = require('./test-helper')
const assert = require('assert')

var sasl = require('../../../lib/crypto/sasl')

const suite = new helper.Suite()

suite.test('sasl/scram', function () {
  suite.test('startSession', function () {
    suite.test('fails when mechanisms does not include SCRAM-SHA-256', function () {
      assert.throws(
        function () {
          sasl.startSession([])
        },
        {
          message: 'SASL: Only mechanism SCRAM-SHA-256 is currently supported',
        }
      )
    })

    suite.test('returns expected session data', function () {
      const session = sasl.startSession(['SCRAM-SHA-256'])

      assert.equal(session.mechanism, 'SCRAM-SHA-256')
      assert.equal(String(session.clientNonce).length, 24)
      assert.equal(session.message, 'SASLInitialResponse')

      assert(session.response.match(/^n,,n=\*,r=.{24}/))
    })

    suite.test('creates random nonces', function () {
      const session1 = sasl.startSession(['SCRAM-SHA-256'])
      const session2 = sasl.startSession(['SCRAM-SHA-256'])

      assert(session1.clientNonce != session2.clientNonce)
    })
  })

  suite.test('continueSession', function () {
    suite.testAsync('fails when last session message was not SASLInitialResponse', async function () {
      assert.rejects(
        function () {
          return sasl.continueSession({}, '', '')
        },
        {
          message: 'SASL: Last message was not SASLInitialResponse',
        }
      )
    })

    suite.testAsync('fails when nonce is missing in server message', function () {
      assert.rejects(
        function () {
          return sasl.continueSession(
            {
              message: 'SASLInitialResponse',
            },
            'bad-password',
            's=1,i=1'
          )
        },
        {
          message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing',
        }
      )
    })

    suite.testAsync('fails when salt is missing in server message', function () {
      assert.rejects(
        function () {
          return sasl.continueSession(
            {
              message: 'SASLInitialResponse',
            },
            'bad-password',
            'r=1,i=1'
          )
        },
        {
          message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing',
        }
      )
    })

    suite.testAsync('fails when client password is not a string', function () {
      for (const badPasswordValue of [null, undefined, 123, new Date(), {}]) {
        assert.rejects(
          function () {
            return sasl.continueSession(
              {
                message: 'SASLInitialResponse',
                clientNonce: 'a',
              },
              badPasswordValue,
              'r=1,i=1'
            )
          },
          {
            message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string',
          }
        )
      }
    })

    suite.testAsync('fails when client password is an empty string', function () {
      assert.rejects(
        function () {
          return sasl.continueSession(
            {
              message: 'SASLInitialResponse',
              clientNonce: 'a',
            },
            '',
            'r=1,i=1'
          )
        },
        {
          message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string',
        }
      )
    })

    suite.testAsync('fails when iteration is missing in server message', function () {
      assert.rejects(
        function () {
          return sasl.continueSession(
            {
              message: 'SASLInitialResponse',
            },
            'bad-password',
            'r=1,s=abcd'
          )
        },
        {
          message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration missing',
        }
      )
    })

    suite.testAsync('fails when server nonce does not start with client nonce', function () {
      assert.rejects(
        function () {
          return sasl.continueSession(
            {
              message: 'SASLInitialResponse',
              clientNonce: '2',
            },
            'bad-password',
            'r=1,s=abcd,i=1'
          )
        },
        {
          message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce',
        }
      )
    })

    suite.testAsync('sets expected session data', async function () {
      const session = {
        message: 'SASLInitialResponse',
        clientNonce: 'a',
      }

      await sasl.continueSession(session, 'password', 'r=ab,s=abcd,i=1')

      assert.equal(session.message, 'SASLResponse')
      assert.equal(session.serverSignature, 'jwt97IHWFn7FEqHykPTxsoQrKGOMXJl/PJyJ1JXTBKc=')

      assert.equal(session.response, 'c=biws,r=ab,p=mU8grLfTjDrJer9ITsdHk0igMRDejG10EJPFbIBL3D0=')
    })
  })

  suite.test('finalizeSession', function () {
    suite.test('fails when last session message was not SASLResponse', function () {
      assert.throws(
        function () {
          sasl.finalizeSession({})
        },
        {
          message: 'SASL: Last message was not SASLResponse',
        }
      )
    })

    suite.test('fails when server signature is not valid base64', function () {
      assert.throws(
        function () {
          sasl.finalizeSession(
            {
              message: 'SASLResponse',
              serverSignature: 'abcd',
            },
            'v=x1' // Purposefully invalid base64
          )
        },
        {
          message: 'SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature must be base64',
        }
      )
    })

    suite.test('fails when server signature does not match', function () {
      assert.throws(
        function () {
          sasl.finalizeSession(
            {
              message: 'SASLResponse',
              serverSignature: 'abcd',
            },
            'v=xyzq'
          )
        },
        {
          message: 'SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature does not match',
        }
      )
    })

    suite.test('does not fail when eveything is ok', function () {
      sasl.finalizeSession(
        {
          message: 'SASLResponse',
          serverSignature: 'abcd',
        },
        'v=abcd'
      )
    })
  })
})

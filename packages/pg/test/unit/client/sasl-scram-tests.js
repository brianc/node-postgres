'use strict'
const helper = require('./test-helper')
const assert = require('assert')

const sasl = require('../../../lib/crypto/sasl')

const suite = new helper.Suite()

suite.test('sasl/scram', function () {
  suite.test('startSession', function () {
    suite.test('fails when mechanisms does not include SCRAM-SHA-256', function () {
      assert.throws(
        function () {
          sasl.startSession([])
        },
        {
          message: 'SASL: Only mechanism(s) SCRAM-SHA-256 are supported',
        }
      )
    })

    suite.test('returns expected session data for SCRAM-SHA-256 (channel binding disabled, offered)', function () {
      const session = sasl.startSession(['SCRAM-SHA-256', 'SCRAM-SHA-256-PLUS'])

      assert.equal(session.mechanism, 'SCRAM-SHA-256')
      assert.equal(String(session.clientNonce).length, 24)
      assert.equal(session.message, 'SASLInitialResponse')

      assert(session.response.match(/^n,,n=\*,r=.{24}$/))
    })

    suite.test('returns expected session data for SCRAM-SHA-256 (channel binding enabled, not offered)', function () {
      const session = sasl.startSession(['SCRAM-SHA-256'], { getPeerCertificate() {} })

      assert.equal(session.mechanism, 'SCRAM-SHA-256')
      assert.equal(String(session.clientNonce).length, 24)
      assert.equal(session.message, 'SASLInitialResponse')

      assert(session.response.match(/^y,,n=\*,r=.{24}$/))
    })

    suite.test('returns expected session data for SCRAM-SHA-256 (channel binding enabled, offered)', function () {
      const session = sasl.startSession(['SCRAM-SHA-256', 'SCRAM-SHA-256-PLUS'], { getPeerCertificate() {} })

      assert.equal(session.mechanism, 'SCRAM-SHA-256-PLUS')
      assert.equal(String(session.clientNonce).length, 24)
      assert.equal(session.message, 'SASLInitialResponse')

      assert(session.response.match(/^p=tls-server-end-point,,n=\*,r=.{24}$/))
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

    suite.testAsync('sets expected session data (SCRAM-SHA-256)', async function () {
      const session = {
        message: 'SASLInitialResponse',
        clientNonce: 'a',
      }

      await sasl.continueSession(session, 'password', 'r=ab,s=abcd,i=1')

      assert.equal(session.message, 'SASLResponse')
      assert.equal(session.serverSignature, 'jwt97IHWFn7FEqHykPTxsoQrKGOMXJl/PJyJ1JXTBKc=')

      assert.equal(session.response, 'c=biws,r=ab,p=mU8grLfTjDrJer9ITsdHk0igMRDejG10EJPFbIBL3D0=')
    })

    suite.testAsync('sets expected session data (SCRAM-SHA-256, channel binding enabled)', async function () {
      const session = {
        message: 'SASLInitialResponse',
        clientNonce: 'a',
      }

      await sasl.continueSession(session, 'password', 'r=ab,s=abcd,i=1', { getPeerCertificate() {} })

      assert.equal(session.message, 'SASLResponse')
      assert.equal(session.serverSignature, 'ETpURSc5OpddrPRSW3LaDPJzUzhh+rciM4uYwXSsohU=')

      assert.equal(session.response, 'c=eSws,r=ab,p=YVTEOwOD7khu/NulscjFegHrZoTXJBFI/7L61AN9khc=')
    })

    suite.testAsync('sets expected session data (SCRAM-SHA-256-PLUS)', async function () {
      const session = {
        message: 'SASLInitialResponse',
        mechanism: 'SCRAM-SHA-256-PLUS',
        clientNonce: 'a',
      }

      await sasl.continueSession(session, 'password', 'r=ab,s=abcd,i=1', {
        getPeerCertificate() {
          return {
            raw: Buffer.from([
              // a minimal ASN.1 certificate structure which can be parsed for a hash type
              0x30, // cert ASN.1 seq
              0x16, // cert length (all bytes below)
              0x30, // cert info ASN.1 seq
              0x01, // cert info length
              0x00, // cert info (skipped)
              0x30, // signature algorithm ASN.1 seq
              0x0d, // signature algorithm length
              0x06, // ASN.1 OID
              0x09, // OID length
              0x2a, // OID: 1.2.840.113549.1.1.11 (RSASSA-PKCS1-v1_5 / SHA-256)
              0x86,
              0x48,
              0x86,
              0xf7,
              0x0d,
              0x01,
              0x01,
              0x0b,
              0x05, // ASN.1 null (no algorithm parameters)
              0x00, // null length
              0x03, // ASN.1 bitstring (signature)
              0x02, // bitstring length
              0x00, // zero right-padding bits
              0xff, // one-byte signature
            ]),
          }
        },
      })

      assert.equal(session.message, 'SASLResponse')
      assert.equal(session.serverSignature, 'pU1hc6JkjvjO8Wd+o0/jyGjc1DpITtsx1UF+ZPa5u5M=')

      assert.equal(
        session.response,
        'c=cD10bHMtc2VydmVyLWVuZC1wb2ludCwsmwepqKDDRcOvo3BN0rplYMfLUTpbaf38btkM5aAXBhQ=,r=ab,p=j0v2LsthoNaIBrKV4YipskF/lV8zWEt6acNRtt99MA4='
      )
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

    suite.test('fails when server returns an error', function () {
      assert.throws(
        function () {
          sasl.finalizeSession(
            {
              message: 'SASLResponse',
              serverSignature: 'abcd',
            },
            'e=no-resources'
          )
        },
        {
          message: 'SASL: SCRAM-SERVER-FINAL-MESSAGE: server returned error: "no-resources"',
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

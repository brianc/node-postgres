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

    suite.test('defaults scramMaxIterations to 100000', function () {
      const session = sasl.startSession(['SCRAM-SHA-256'])

      assert.equal(session.scramMaxIterations, 100000)
    })

    suite.test('honors a custom scramMaxIterations', function () {
      const session = sasl.startSession(['SCRAM-SHA-256'], null, 50)

      assert.equal(session.scramMaxIterations, 50)
    })
  })

  suite.test('continueSession', function () {
    suite.test('fails when last session message was not SASLInitialResponse', async () => {
      await assert.rejects(sasl.continueSession({}, '', ''), {
        message: 'SASL: Last message was not SASLInitialResponse',
      })
    })

    suite.test('fails when nonce is missing in server message', async () => {
      await assert.rejects(
        sasl.continueSession(
          {
            message: 'SASLInitialResponse',
          },
          'bad-password',
          's=1,i=1'
        ),
        {
          message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing',
        }
      )
    })

    suite.test('fails when salt is missing in server message', async () => {
      await assert.rejects(
        sasl.continueSession(
          {
            message: 'SASLInitialResponse',
          },
          'bad-password',
          'r=1,i=1'
        ),
        {
          message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing',
        }
      )
    })

    suite.test('fails when client password is not a string', async () => {
      for (const badPasswordValue of [null, undefined, 123, new Date(), {}]) {
        await assert.rejects(
          sasl.continueSession(
            {
              message: 'SASLInitialResponse',
              clientNonce: 'a',
            },
            badPasswordValue,
            'r=1,i=1'
          ),
          {
            message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string',
          }
        )
      }
    })

    suite.test('fails when client password is an empty string', async () => {
      await assert.rejects(
        sasl.continueSession(
          {
            message: 'SASLInitialResponse',
            clientNonce: 'a',
          },
          '',
          'r=1,i=1'
        ),
        {
          message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string',
        }
      )
    })

    suite.test('fails when iteration is missing in server message', async () => {
      await assert.rejects(
        sasl.continueSession(
          {
            message: 'SASLInitialResponse',
          },
          'bad-password',
          'r=1,s=abcd'
        ),
        {
          message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration missing',
        }
      )
    })

    suite.test('fails when server nonce does not start with client nonce', async () => {
      await assert.rejects(
        sasl.continueSession(
          {
            message: 'SASLInitialResponse',
            clientNonce: '2',
          },
          'bad-password',
          'r=1,s=abcd,i=1'
        ),
        {
          message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce',
        }
      )
    })

    suite.test('fails when iteration count exceeds default scramMaxIterations', async function () {
      await assert.rejects(
        function () {
          return sasl.continueSession(
            {
              message: 'SASLInitialResponse',
              clientNonce: 'a',
              scramMaxIterations: 100000,
            },
            'password',
            'r=ab,s=abcd,i=100001'
          )
        },
        {
          message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration count 100001 exceeds scramMaxIterations of 100000',
        }
      )
    })

    suite.test('fails when iteration count exceeds a custom scramMaxIterations', async function () {
      await assert.rejects(
        function () {
          return sasl.continueSession(
            {
              message: 'SASLInitialResponse',
              clientNonce: 'a',
              scramMaxIterations: 10,
            },
            'password',
            'r=ab,s=abcd,i=11'
          )
        },
        {
          message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration count 11 exceeds scramMaxIterations of 10',
        }
      )
    })

    suite.test('allows iteration count at the scramMaxIterations limit', async function () {
      const session = {
        message: 'SASLInitialResponse',
        clientNonce: 'a',
        scramMaxIterations: 5,
      }

      await sasl.continueSession(session, 'password', 'r=ab,s=abcd,i=5')

      assert.equal(session.message, 'SASLResponse')
    })

    suite.test('disables the iteration count check when scramMaxIterations is 0', async function () {
      const session = {
        message: 'SASLInitialResponse',
        clientNonce: 'a',
        scramMaxIterations: 0,
      }

      await sasl.continueSession(session, 'password', 'r=ab,s=abcd,i=999999')

      assert.equal(session.message, 'SASLResponse')
    })

    suite.test('sets expected session data (SCRAM-SHA-256)', async function () {
      const session = {
        message: 'SASLInitialResponse',
        clientNonce: 'a',
      }

      await sasl.continueSession(session, 'password', 'r=ab,s=abcd,i=1')

      assert.equal(session.message, 'SASLResponse')
      assert.equal(session.serverSignature, 'jwt97IHWFn7FEqHykPTxsoQrKGOMXJl/PJyJ1JXTBKc=')

      assert.equal(session.response, 'c=biws,r=ab,p=mU8grLfTjDrJer9ITsdHk0igMRDejG10EJPFbIBL3D0=')
    })

    suite.test('sets expected session data (SCRAM-SHA-256, channel binding enabled)', async function () {
      const session = {
        message: 'SASLInitialResponse',
        clientNonce: 'a',
      }

      await sasl.continueSession(session, 'password', 'r=ab,s=abcd,i=1', { getPeerCertificate() {} })

      assert.equal(session.message, 'SASLResponse')
      assert.equal(session.serverSignature, 'ETpURSc5OpddrPRSW3LaDPJzUzhh+rciM4uYwXSsohU=')

      assert.equal(session.response, 'c=eSws,r=ab,p=YVTEOwOD7khu/NulscjFegHrZoTXJBFI/7L61AN9khc=')
    })

    suite.test('SASLprep maps non-ASCII space characters (RFC 3454 C.1.2) to U+0020 SPACE', async function () {
      // SASLprep probably misuses the C.1.2 table; U+200B, in particular, is listed in both the C.1.2 and B.1 tables. We treat it as a space for compatibility with PostgreSQL.
      const sessionPrepped = { message: 'SASLInitialResponse', clientNonce: 'a' }
      const sessionRef = { message: 'SASLInitialResponse', clientNonce: 'a' }

      await sasl.continueSession(sessionPrepped, '\u200bfoo\xa0bar', 'r=ab,s=abcd,i=1')
      await sasl.continueSession(sessionRef, ' foo bar', 'r=ab,s=abcd,i=1')

      assert.equal(sessionPrepped.serverSignature, sessionRef.serverSignature)
      assert.equal(sessionPrepped.response, sessionRef.response)
    })

    suite.test('SASLprep maps mapped-to-nothing characters before PBKDF2 (RFC 3454 B.1)', async function () {
      // Soft hyphen U+00AD is mapped to nothing by SASLprep, so 'I\u00ADX'
      // must produce identical SCRAM output to 'IX'. This proves the prep
      // step is engaged on the SCRAM derivation path. Without the fix the
      // two would diverge and this assertion would fail.
      const sessionPrepped = { message: 'SASLInitialResponse', clientNonce: 'a' }
      const sessionRef = { message: 'SASLInitialResponse', clientNonce: 'a' }

      await sasl.continueSession(sessionPrepped, 'I\u00ADX', 'r=ab,s=abcd,i=1')
      await sasl.continueSession(sessionRef, 'IX', 'r=ab,s=abcd,i=1')

      assert.equal(sessionPrepped.serverSignature, sessionRef.serverSignature)
      assert.equal(sessionPrepped.response, sessionRef.response)
    })

    suite.test('SASLprep NFKC-normalizes passwords before PBKDF2 (RFC 4013 §2.2)', async function () {
      // ROMAN NUMERAL IX (U+2168) NFKC-decomposes to the ASCII letters 'IX'.
      // PostgreSQL's server applies SASLprep when computing the verifier, so
      // a role created with U+2168 is stored as if it were 'IX'. The client
      // must do the same.
      const sessionPrepped = { message: 'SASLInitialResponse', clientNonce: 'a' }
      const sessionRef = { message: 'SASLInitialResponse', clientNonce: 'a' }

      await sasl.continueSession(sessionPrepped, '\u2168', 'r=ab,s=abcd,i=1')
      await sasl.continueSession(sessionRef, 'IX', 'r=ab,s=abcd,i=1')

      assert.equal(sessionPrepped.serverSignature, sessionRef.serverSignature)
      assert.equal(sessionPrepped.response, sessionRef.response)
    })

    suite.test('passes ASCII control characters through normalization unchanged', async function () {
      // BEL (U+0007) is an ASCII control character. The minimal SASLprep
      // implementation (B.1 mapping → C.1.2 mapping → NFKC) is the identity
      // on ASCII control codes, so the bytes fed to PBKDF2 are exactly the
      // raw password. We snapshot the resulting SCRAM output as a regression
      // guard: if anyone ever swaps the order of operations, removes the
      // NFKC step, or accidentally strips ASCII bytes, this assertion trips.
      const session = { message: 'SASLInitialResponse', clientNonce: 'a' }

      await sasl.continueSession(session, '\u0007abc', 'r=ab,s=abcd,i=1')

      assert.equal(session.message, 'SASLResponse')
      assert.equal(session.serverSignature, 'ytJN8GA+9TeZpeS28ix+u0cwaIB7iFlWgpAsmy+MmP0=')
      assert.equal(session.response, 'c=biws,r=ab,p=04HAPnY4K2UhwiD2RJtFw9sU81SLcas8B1Uqdqv8SeQ=')
    })

    suite.test('sets expected session data (SCRAM-SHA-256-PLUS)', async function () {
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

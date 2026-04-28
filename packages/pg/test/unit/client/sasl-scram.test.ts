import assert from 'node:assert'
import { Buffer } from 'node:buffer'

import { describe, it } from 'vitest'

import sasl from '../../../src/crypto/sasl.ts'

describe('sasl/scram', () => {
  describe('startSession', () => {
    it('fails when mechanisms does not include SCRAM-SHA-256', () => {
      assert.throws(() => sasl.startSession([], null), {
        message: 'SASL: Only mechanism(s) SCRAM-SHA-256 are supported',
      })
    })

    it('returns expected data for SCRAM-SHA-256 (channel binding disabled)', () => {
      const session = sasl.startSession(['SCRAM-SHA-256', 'SCRAM-SHA-256-PLUS'], null)
      assert.equal(session.mechanism, 'SCRAM-SHA-256')
      assert.equal(String(session.clientNonce).length, 24)
      assert.equal(session.message, 'SASLInitialResponse')
      assert(session.response.match(/^n,,n=\*,r=.{24}$/))
    })

    it('returns expected data for SCRAM-SHA-256 (channel binding enabled, not offered)', () => {
      const session = sasl.startSession(['SCRAM-SHA-256'], { getPeerCertificate: () => ({ raw: Buffer.alloc(0) }) })
      assert.equal(session.mechanism, 'SCRAM-SHA-256')
      assert(session.response.match(/^y,,n=\*,r=.{24}$/))
    })

    it('returns expected data for SCRAM-SHA-256 (channel binding enabled, offered)', () => {
      const session = sasl.startSession(['SCRAM-SHA-256', 'SCRAM-SHA-256-PLUS'], {
        getPeerCertificate: () => ({ raw: Buffer.alloc(0) }),
      })
      assert.equal(session.mechanism, 'SCRAM-SHA-256-PLUS')
      assert(session.response.match(/^p=tls-server-end-point,,n=\*,r=.{24}$/))
    })

    it('creates random nonces', () => {
      const session1 = sasl.startSession(['SCRAM-SHA-256'], null)
      const session2 = sasl.startSession(['SCRAM-SHA-256'], null)
      assert(session1.clientNonce !== session2.clientNonce)
    })
  })

  describe('continueSession', () => {
    it('fails when last session message was not SASLInitialResponse', async () => {
      await assert.rejects(() => sasl.continueSession({} as never, '', '', null), {
        message: 'SASL: Last message was not SASLInitialResponse',
      })
    })

    it('fails when nonce is missing in server message', async () => {
      await assert.rejects(
        () => sasl.continueSession({ message: 'SASLInitialResponse' } as never, 'bad-password', 's=1,i=1', null),
        { message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing' }
      )
    })

    it('fails when salt is missing in server message', async () => {
      await assert.rejects(
        () => sasl.continueSession({ message: 'SASLInitialResponse' } as never, 'bad-password', 'r=1,i=1', null),
        { message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing' }
      )
    })

    it('fails when client password is not a string', async () => {
      for (const badPasswordValue of [null, undefined, 123, new Date(), {}]) {
        await assert.rejects(
          () =>
            sasl.continueSession(
              { message: 'SASLInitialResponse', clientNonce: 'a' } as never,
              badPasswordValue as never,
              'r=1,i=1',
              null
            ),
          { message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string' }
        )
      }
    })

    it('fails when client password is an empty string', async () => {
      await assert.rejects(
        () => sasl.continueSession({ message: 'SASLInitialResponse', clientNonce: 'a' } as never, '', 'r=1,i=1', null),
        { message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string' }
      )
    })

    it('fails when iteration is missing in server message', async () => {
      await assert.rejects(
        () => sasl.continueSession({ message: 'SASLInitialResponse' } as never, 'bad-password', 'r=1,s=abcd', null),
        { message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration missing' }
      )
    })

    it('fails when server nonce does not start with client nonce', async () => {
      await assert.rejects(
        () =>
          sasl.continueSession(
            { message: 'SASLInitialResponse', clientNonce: '2' } as never,
            'bad-password',
            'r=1,s=abcd,i=1',
            null
          ),
        { message: 'SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce' }
      )
    })

    it('sets expected session data (SCRAM-SHA-256)', async () => {
      const session: { message: string; clientNonce: string; serverSignature?: string; response?: string } = {
        message: 'SASLInitialResponse',
        clientNonce: 'a',
      }
      await sasl.continueSession(session as never, 'password', 'r=ab,s=abcd,i=1', null)
      assert.equal(session.message, 'SASLResponse')
      assert.equal(session.serverSignature, 'jwt97IHWFn7FEqHykPTxsoQrKGOMXJl/PJyJ1JXTBKc=')
      assert.equal(session.response, 'c=biws,r=ab,p=mU8grLfTjDrJer9ITsdHk0igMRDejG10EJPFbIBL3D0=')
    })

    it('sets expected session data (SCRAM-SHA-256, channel binding enabled)', async () => {
      const session: { message: string; clientNonce: string; serverSignature?: string; response?: string } = {
        message: 'SASLInitialResponse',
        clientNonce: 'a',
      }
      await sasl.continueSession(session as never, 'password', 'r=ab,s=abcd,i=1', {
        getPeerCertificate: () => ({ raw: Buffer.alloc(0) }),
      })
      assert.equal(session.message, 'SASLResponse')
      assert.equal(session.serverSignature, 'ETpURSc5OpddrPRSW3LaDPJzUzhh+rciM4uYwXSsohU=')
      assert.equal(session.response, 'c=eSws,r=ab,p=YVTEOwOD7khu/NulscjFegHrZoTXJBFI/7L61AN9khc=')
    })

    it('sets expected session data (SCRAM-SHA-256-PLUS)', async () => {
      const session: {
        message: string
        mechanism: string
        clientNonce: string
        serverSignature?: string
        response?: string
      } = {
        message: 'SASLInitialResponse',
        mechanism: 'SCRAM-SHA-256-PLUS',
        clientNonce: 'a',
      }
      await sasl.continueSession(session as never, 'password', 'r=ab,s=abcd,i=1', {
        getPeerCertificate: () => ({
          raw: Buffer.from([
            0x30, 0x16, 0x30, 0x01, 0x00, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b,
            0x05, 0x00, 0x03, 0x02, 0x00, 0xff,
          ]),
        }),
      })
      assert.equal(session.message, 'SASLResponse')
      assert.equal(session.serverSignature, 'pU1hc6JkjvjO8Wd+o0/jyGjc1DpITtsx1UF+ZPa5u5M=')
      assert.equal(
        session.response,
        'c=cD10bHMtc2VydmVyLWVuZC1wb2ludCwsmwepqKDDRcOvo3BN0rplYMfLUTpbaf38btkM5aAXBhQ=,r=ab,p=j0v2LsthoNaIBrKV4YipskF/lV8zWEt6acNRtt99MA4='
      )
    })
  })

  describe('finalizeSession', () => {
    it('fails when last session message was not SASLResponse', () => {
      assert.throws(() => sasl.finalizeSession({} as never, ''), { message: 'SASL: Last message was not SASLResponse' })
    })

    it('fails when server signature is not valid base64', () => {
      assert.throws(() => sasl.finalizeSession({ message: 'SASLResponse', serverSignature: 'abcd' } as never, 'v=x1'), {
        message: 'SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature must be base64',
      })
    })

    it('fails when server signature does not match', () => {
      assert.throws(
        () => sasl.finalizeSession({ message: 'SASLResponse', serverSignature: 'abcd' } as never, 'v=xyzq'),
        { message: 'SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature does not match' }
      )
    })

    it('does not fail when everything is ok', () => {
      sasl.finalizeSession({ message: 'SASLResponse', serverSignature: 'abcd' } as never, 'v=abcd')
    })
  })
})

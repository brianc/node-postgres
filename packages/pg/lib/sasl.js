'use strict'
const crypto = require('crypto')

function startSession(mechanisms) {
  if (mechanisms.indexOf('SCRAM-SHA-256') === -1) {
    throw new Error('SASL: Only mechanism SCRAM-SHA-256 is currently supported')
  }

  const clientNonce = crypto.randomBytes(18).toString('base64')

  return {
    mechanism: 'SCRAM-SHA-256',
    clientNonce,
    response: 'n,,n=*,r=' + clientNonce,
    message: 'SASLInitialResponse',
  }
}

function continueSession(session, password, serverData) {
  if (session.message !== 'SASLInitialResponse') {
    throw new Error('SASL: Last message was not SASLInitialResponse')
  }

  const sv = extractVariablesFromFirstServerMessage(serverData)

  if (!sv.nonce.startsWith(session.clientNonce)) {
    throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce')
  }

  var saltBytes = Buffer.from(sv.salt, 'base64')

  var saltedPassword = Hi(password, saltBytes, sv.iteration)

  var clientKey = hmacSha256(saltedPassword, 'Client Key')
  var storedKey = sha256(clientKey)

  var clientFirstMessageBare = 'n=*,r=' + session.clientNonce
  var serverFirstMessage = 'r=' + sv.nonce + ',s=' + sv.salt + ',i=' + sv.iteration

  var clientFinalMessageWithoutProof = 'c=biws,r=' + sv.nonce

  var authMessage = clientFirstMessageBare + ',' + serverFirstMessage + ',' + clientFinalMessageWithoutProof

  var clientSignature = hmacSha256(storedKey, authMessage)
  var clientProofBytes = xorBuffers(clientKey, clientSignature)
  var clientProof = clientProofBytes.toString('base64')

  var serverKey = hmacSha256(saltedPassword, 'Server Key')
  var serverSignatureBytes = hmacSha256(serverKey, authMessage)

  session.message = 'SASLResponse'
  session.serverSignature = serverSignatureBytes.toString('base64')
  session.response = clientFinalMessageWithoutProof + ',p=' + clientProof
}

function finalizeSession(session, serverData) {
  if (session.message !== 'SASLResponse') {
    throw new Error('SASL: Last message was not SASLResponse')
  }

  const attrPairs = parseAttributePairs(serverData)
  const serverSignature = attrPairs.get('v')
  if (!serverSignature) {
    throw new TypeError('SASL: server signature is missing')
  }

  if (serverSignature !== session.serverSignature) {
    throw new Error('SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature does not match')
  }
}

function parseAttributePairs(text) {
  if (typeof text !== 'string') {
    throw new TypeError('SASL: attribute pairs text must be a string')
  }

  return new Map(
    text.split(',').map((attrValue) => {
      if (!/^.=/.test(attrValue)) {
        throw new Error('SASL: Invalid attribute pair entry')
      }
      const name = attrValue[0]
      const value = attrValue.substring(2)
      return [name, value]
    })
  )
}

function extractVariablesFromFirstServerMessage(data) {
  const attrPairs = parseAttributePairs(data)

  const nonce = attrPairs.get('r')
  if (!nonce) {
    throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing')
  }
  const salt = attrPairs.get('s')
  if (!salt) {
    throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing')
  }
  const iterationText = attrPairs.get('i')
  if (!iterationText) {
    throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration missing')
  } else if (!/^[1-9][0-9]*$/.test(iterationText)) {
    throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: invalid iteration count')
  }
  const iteration = parseInt(iterationText, 10)

  return {
    nonce,
    salt,
    iteration,
  }
}

function xorBuffers(a, b) {
  if (!Buffer.isBuffer(a)) a = Buffer.from(a)
  if (!Buffer.isBuffer(b)) b = Buffer.from(b)
  var res = []
  if (a.length > b.length) {
    for (var i = 0; i < b.length; i++) {
      res.push(a[i] ^ b[i])
    }
  } else {
    for (var j = 0; j < a.length; j++) {
      res.push(a[j] ^ b[j])
    }
  }
  return Buffer.from(res)
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest()
}

function hmacSha256(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest()
}

function Hi(password, saltBytes, iterations) {
  var ui1 = hmacSha256(password, Buffer.concat([saltBytes, Buffer.from([0, 0, 0, 1])]))
  var ui = ui1
  for (var i = 0; i < iterations - 1; i++) {
    ui1 = hmacSha256(password, ui1)
    ui = xorBuffers(ui, ui1)
  }

  return ui
}

module.exports = {
  startSession,
  continueSession,
  finalizeSession,
}

'use strict'
var helper = require('./test-helper')
const BufferList = require('../../buffer-list')
var crypto = require('../../../lib/crypto/utils')
const assert = require('assert')
const suite = new helper.Suite()
const test = suite.test.bind(suite)

test('md5 authentication', async function () {
  var client = helper.createClient()
  client.password = '!'
  var salt = Buffer.from([1, 2, 3, 4])
  await client.connection.emit('authenticationMD5Password', { salt: salt })

  setTimeout(() =>
    test('responds', function () {
      assert.lengthIs(client.connection.stream.packets, 1)
      test('should have correct encrypted data', async function () {
        var password = await crypto.postgresMd5PasswordHash(client.user, client.password, salt)
        // how do we want to test this?
        assert.equalBuffers(client.connection.stream.packets[0], new BufferList().addCString(password).join(true, 'p'))
      })
    })
  )
})

test('md5 of utf-8 strings', async function () {
  assert.equal(await crypto.md5('😊'), '5deda34cd95f304948d2bc1b4a62c11e')
})

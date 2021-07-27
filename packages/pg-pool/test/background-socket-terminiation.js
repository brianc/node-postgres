'use strict'
const net = require('net')
const co = require('co')
const expect = require('expect.js')

const describe = require('mocha').describe
const it = require('mocha').it

const Pool = require('../')

describe('a socket disconnecting in the background', () => {
  it('should leave the pool in a usable state', async () => {
    const pool = new Pool({ max: 1 })
    // just run any arbitrary query
    const client = await pool.connect()
    await client.query('SELECT NOW()')
    // return the client
    client.release()

    // now kill the socket in the background
    client.connection.stream.end()

    // now try to query again, it should work
    await pool.query('SELECT NOW()')
    await pool.query('SELECT NOW()')
    await pool.query('SELECT NOW()')
    await pool.query('SELECT NOW()')

    await pool.end()
  })
})

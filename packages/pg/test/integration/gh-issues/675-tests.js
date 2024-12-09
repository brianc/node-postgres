'use strict'
const helper = require('../test-helper')
const assert = require('assert')

const pool = new helper.pg.Pool()
pool.connect(function (err, client, done) {
  if (err) throw err

  let c = 'CREATE TEMP TABLE posts (body TEXT)'

  client.query(c, function (err) {
    if (err) throw err

    c = 'INSERT INTO posts (body) VALUES ($1) RETURNING *'

    let body = Buffer.from('foo')
    client.query(c, [body], function (err) {
      if (err) throw err

      body = Buffer.from([])
      client.query(c, [body], function (err, res) {
        done()

        if (err) throw err
        assert.equal(res.rows[0].body, '')
        pool.end()
      })
    })
  })
})

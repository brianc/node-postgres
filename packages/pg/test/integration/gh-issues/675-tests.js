'use strict'
var helper = require('../test-helper')
var assert = require('assert')

const pool = new helper.pg.Pool()
pool.connect(function (err, client, done) {
  if (err) throw err

  var c = 'CREATE TEMP TABLE posts (body TEXT)'

  client.query(c, function (err) {
    if (err) throw err

    c = 'INSERT INTO posts (body) VALUES ($1) RETURNING *'

    var body = Buffer.from('foo')
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

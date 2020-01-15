'use strict'
var helper = require('./test-helper')
var assert = require('assert')

const pool = new helper.pg.Pool()
pool.connect(assert.success(function (client, done) {
  helper.versionGTE(client, 90200, assert.success(function (jsonSupported) {
    if (!jsonSupported) {
      console.log('skip json test on older versions of postgres')
      done()
      return pool.end()
    }
    client.query('CREATE TEMP TABLE stuff(id SERIAL PRIMARY KEY, data JSON)')
    var value = { name: 'Brian', age: 250, alive: true, now: new Date() }
    client.query('INSERT INTO stuff (data) VALUES ($1)', [value])
    client.query('SELECT * FROM stuff', assert.success(function (result) {
      assert.equal(result.rows.length, 1)
      assert.equal(typeof result.rows[0].data, 'object')
      var row = result.rows[0].data
      assert.strictEqual(row.name, value.name)
      assert.strictEqual(row.age, value.age)
      assert.strictEqual(row.alive, value.alive)
      assert.equal(JSON.stringify(row.now), JSON.stringify(value.now))
      done()
      pool.end()
    }))
  }))
}))

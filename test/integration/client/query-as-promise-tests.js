var helper = require(__dirname + '/../test-helper');
var pg = helper.pg;
var semver = require('semver')

if (semver.lt(process.version, '0.12.0')) {
  return console.log('promises are not supported in node < v0.10')
}

process.on('unhandledRejection', function(e) {
  console.error(e, e.stack)
  process.exit(1)
})

pg.connect(helper.config, assert.success(function(client, done) {
  client.query('SELECT $1::text as name', ['foo'])
    .then(function(result) {
      assert.equal(result.rows[0].name, 'foo')
      return client
    })
    .then(function(client) {
      client.query('ALKJSDF')
        .catch(function(e) {
          assert(e instanceof Error)
        })
    })

  client.query('SELECT 1 as num')
    .then(function(result) {
      assert.equal(result.rows[0].num, 1)
      done()
      pg.end()
    })
}))

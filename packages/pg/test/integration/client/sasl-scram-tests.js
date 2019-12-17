'use strict'
var helper = require(__dirname + '/../test-helper')
var pg = helper.pg

var suite = new helper.Suite()

/*
SQL to create test role:

set password_encryption = 'scram-sha-256';
create role npgtest login password 'test';

pg_hba:
host    all             npgtest             ::1/128            scram-sha-256
host    all             npgtest             0.0.0.0/0            scram-sha-256


*/
/*
suite.test('can connect using sasl/scram', function () {
	var connectionString = 'pg://npgtest:test@localhost/postgres'
	const pool = new pg.Pool({ connectionString: connectionString })
	pool.connect(
		assert.calls(function (err, client, done) {
			assert.ifError(err, 'should have connected')
			done()
		})
	)
})

suite.test('sasl/scram fails when password is wrong', function () {
	var connectionString = 'pg://npgtest:bad@localhost/postgres'
	const pool = new pg.Pool({ connectionString: connectionString })
	pool.connect(
		assert.calls(function (err, client, done) {
			assert.ok(err, 'should have a connection error')
			done()
		})
	)
})
*/

var helper = require(__dirname + '/test-helper');

helper.config.validate = assert.calls(function (client) {
	assert.isNull(client);
	return true;
});

test('custom validate', function () {
	helper.pg.connect(helper.config, assert.calls(function (err, client, done) {
		assert.isNull(err);
		client.query('SELECT NOW()');
		done();
	}));
});
var helper = require(__dirname + '/test-helper');

test('connection event', function () {

	var pool = helper.pg.pools.getOrCreate(helper.config);
	pool.on('connection', assert.calls(function (client) {
		assert.isNull(client);
	}));

	helper.pg.connect(helper.config, assert.calls(function (err, client, done) {
		assert.isNull(err);
		done();
	}));
});
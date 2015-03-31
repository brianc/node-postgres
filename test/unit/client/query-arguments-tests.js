var helper = require(__dirname + "/test-helper");

test('check that passed arguments types are not changed during the query phase', function() {
	var client = helper.client();
	var originalArguments = [1,new Date()];
	var arguments = originalArguments.slice();
	client.query('SELECT 1 WHERE 0 <> $1 AND 0 <> $2',arguments, function() {
		// Check for length
		assert.equal(arguments.length,originalArguments.length);
		// Check values types
		assert.deepEqual(isNaN(arguments[0]),false);
		assert.deepEqual(arguments[1] instanceof Date,true);
	});
});

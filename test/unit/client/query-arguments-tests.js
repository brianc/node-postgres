var helper = require(__dirname + "/test-helper");

test('check that passed arguments types are not changed during the query phase', function() {
	var client = helper.client();
	var originalArguments = [1,2,3];
	var arguments = originalArguments.slice();
	client.query('SELECT 1 WHERE 0 <> $1 AND 0 <> $2 AND 0 <> $3',arguments, function() {
		// Check for length
		assert.equal(arguments.length,originalArguments.length);
		// Check values
		assert.deepEqual(arguments[0],originalArguments[0]);
		assert.deepEqual(arguments[1],originalArguments[1]);
		assert.deepEqual(arguments[2],originalArguments[2]);
	});
});

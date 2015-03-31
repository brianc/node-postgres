var helper = require(__dirname + "/test-helper");

test('check that passed arguments types are not changed during the query phase', function() {
	var client = helper.client();
	var originalArguments = [1,2,3];
	var arguments = originalArguments.slice();
	client.query('SELECT 1 WHERE 0 <> $1 AND 0 <> $2 AND 0 <> $3',arguments, function() {
		// Check for length
		assert.equal(arguments.length,originalArguments.length);
		// Check values types, expect numbers, not strings
		assert.deepEqual(isNaN(arguments[0]),true);
		assert.deepEqual(isNaN(arguments[1]),true);
		assert.deepEqual(isNaN(arguments[2]),true);
	});
});

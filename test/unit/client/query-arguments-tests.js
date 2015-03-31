var helper = require(__dirname + "/test-helper");

test('check that passed arguments types are not changed during the query phase', function() {
	var client = helper.client();
	var originalArguments = [1,new Date()];
	var arguments = originalArguments.slice();
	
	var query = client.query({
		text: 'SELECT 1 WHERE 0 <> $1 AND 0 <> $2',
		values: arguments
	});

	assert.emits(query,'end', function() {
		test('parse argument', function() {
			assert.equal(arguments.length,originalArguments.length,'expecting same length as given array!');
			assert.strictEqual(isNaN(arguments[0]),false,'expecting a number!');
			assert.strictEqual(arguments[1] instanceof Date,true,'expecting a Date object!');
		});
	});

	// Check for length

	// Check values types

	/*
	client.query('SELECT 1 WHERE 0 <> $1 AND 0 <> $2',arguments, function(err, result) {
		assert.equal(err,null,'expecting no error');
		console.log('err:',err);
		console.log('result:',result.rows[0]);
		console.log(arguments);
		assert.equal(result.rows.length,1,'expecting 1 row');
		// Check for length
		assert.equal(arguments.length,originalArguments.length,'expecting same lenght as given array!');
		// Check values types
		assert.strictEqual(isNaN(arguments[0]),false,'expecting a number!');
		assert.strictEqual(arguments[1] instanceof Date,true,'expecting a Date object!');
	});
	*/
});

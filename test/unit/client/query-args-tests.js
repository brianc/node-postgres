var helper = require(__dirname + '/test-helper');

test('check that passed values types have not been changed during the query phase', function() {
	var client = helper.client();
	client.connect(assert.success(function() {
		var originalValues = [1,new Date()];
		var values = originalValues.slice();
		var config = {
			text: 'SELECT 1 WHERE 0 <> $1 AND 0 <> $2',
			values: values
		};
		client.query(config, function(result) {
			assert.equal(result.rows.length, 1);
			console.log('result:',result.rows[0]);
			assert.equal(values.length,originalValues.length,'expecting same length as given array!');
			assert.strictEqual(isNaN(values[0]),false,'expecting a number!');
			assert.strictEqual(values[1] instanceof Date,true,'expecting a Date object!');
			client.end();
		});
	}));
});
var helper = require(__dirname + '/test-helper');
var Client = helper.Client;
var conInfo = helper.config;

test('check that passed arguments types have not been changed during the query phase', function() {
	var client = new Client(conInfo);
	client.connect(assert.success(function() {
		var originalArguments = [1,new Date()];
		var arguments = originalArguments.slice();
		var config = {
			text: 'SELECT 1 WHERE 0 <> $1 AND 0 <> $2',
			values: arguments
		};
		client.query(config, assert.success(function(result) {
			assert.equal(result.rows.length, 1);
			assert.equal(arguments.length,originalArguments.length,'expecting same length as given array!');
			assert.strictEqual(isNaN(arguments[0]),false,'expecting a number!');
			assert.strictEqual(arguments[1] instanceof Date,true,'expecting a Date object!');
			client.end();
		}));
	}));
});
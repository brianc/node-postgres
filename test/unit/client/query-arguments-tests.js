var helper = require(__dirname + "/test-helper");

var client = helper.client();
var originalArguments = [1,new Date()];
var arguments = originalArguments.slice();

client.query('SELECT 1 WHERE 0 <> $1 AND 0 <> $2',arguments);
client.on('row', function(row) {
	test('check that passed arguments types have not been changed during the query phase', function() {
		assert.notEqual(row,undefined);
		assert.notEqual(row,null);
		assert.equal(arguments.length,originalArguments.length,'expecting same length as given array!');
		assert.strictEqual(isNaN(arguments[0]),false,'expecting a number!');
		assert.strictEqual(arguments[1] instanceof Date,true,'expecting a Date object!');
	});
});


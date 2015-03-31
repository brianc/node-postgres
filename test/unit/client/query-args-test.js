/**
 * Created by nick on 31/03/15.
 */
var helper = require(__dirname + '/test-helper');
var Client = helper.Client;
var conInfo = helper.config;

test('check that passed values types have not been changed during the query phase', function() {
	var client = new Client(conInfo);
	client.connect(assert.success(function() {
		var originalValues = [1,new Date()];
		var values = originalValues.slice();
		var config = {
			text: 'SELECT 1 WHERE 0 <> $1 AND 0 <> $2',
			values: values
		};
		client.query(config, assert.success(function(result) {
			assert.equal(result.rows.length, 1);
			console.log('result:',result.rows[0]);
			assert.equal(values.length,originalValues.length,'expecting same length as given array!');
			assert.strictEqual(isNaN(values[0]),false,'expecting a number!');
			assert.strictEqual(values[1] instanceof Date,true,'expecting a Date object!');
			client.end();
		}));
	}));
});
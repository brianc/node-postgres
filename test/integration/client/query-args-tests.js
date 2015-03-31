var helper = require(__dirname + '/test-helper');
var pg = helper.pg;
var config = helper.config;

test('check that passed values types have not been changed during the query phase', function() {

	pg.connect(config, assert.success(function(client, done) {
		var originalValues = [1,2];
		var values = originalValues.slice();

		client.query('SELECT 1 WHERE 0 <> $1 AND 0 <> $2',values, assert.success(function(err,result) {
			assert.isNull(err);
			assert.equal(result.rows.length, 1);
			console.log('result:',result.rows[0]);
			assert.equal(values.length,originalValues.length,'expecting same length as given array!');
			assert.strictEqual(isNaN(values[0]),false,'expecting a number!');
			assert.strictEqual(isNaN(values[1]),false,'expecting a number!');
			done();
		}));

	}));
});
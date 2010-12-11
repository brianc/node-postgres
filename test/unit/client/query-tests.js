var helper = require(__dirname + '/test-helper');
var q = require('query')

test("testing dateParser", function() {
	assert.equal(q.dateParser("2010-12-11 09:09:04").toUTCString(),new Date("2010-12-11 09:09:04 GMT").toUTCString());
});


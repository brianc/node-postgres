var helper = require(__dirname + '/test-helper');
var q = require('query')

test("testing dateParser", function() {
	assert.equal(q.dateParser("2010-12-11 09:09:04").toUTCString(),new Date("2010-12-11 09:09:04 GMT").toUTCString());
});

test("testing 2dateParser", function() {
	assert.equal(JSON.stringify(q.dateParser("2010-12-11 09:09:04.19")),"\"2010-12-11T09:09:04.190Z\"");
});


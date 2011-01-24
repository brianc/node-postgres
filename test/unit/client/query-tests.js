var helper = require(__dirname + '/test-helper');
var q = require('query')

test("testing dateParser", function() {
  assert.equal(q.dateParser("2010-12-11 09:09:04").toUTCString(),new Date("2010-12-11 09:09:04 GMT").toUTCString());
});

test("testing 2dateParser", function() {
  var actual = "2010-12-11 09:09:04.19";
  var expected = "\"2010-12-11T09:09:04.190Z\"";
  assert.equal(JSON.stringify(q.dateParser(actual)),expected);
});

test("testing 2dateParser", function() {
  var actual = "2011-01-23 22:15:51.28-06";
  var expected = "\"2011-01-24T04:15:51.280Z\"";
  assert.equal(JSON.stringify(q.dateParser(actual)),expected);
});


var helper = require(__dirname + '/test-helper');
var q = {};
q.dateParser = require(__dirname + "/../../../lib/types").getStringTypeParser(1114);

test("testing dateParser", function() {
  assert.equal(q.dateParser("2010-12-11 09:09:04").toUTCString(),new Date("2010-12-11 09:09:04 GMT").toUTCString());
});

var testForMs = function(part, expected) {
  var dateString = "2010-01-01 01:01:01" + part;
  test('testing for correcting parsing of ' + dateString, function() {
    var ms = q.dateParser(dateString).getMilliseconds();
    assert.equal(ms, expected)
  })
}

testForMs('.1', 100);
testForMs('.01', 10);
testForMs('.74', 740);

test("testing 2dateParser", function() {
  var actual = "2010-12-11 09:09:04.1";
  var expected = "\"2010-12-11T09:09:04.100Z\"";
  assert.equal(JSON.stringify(q.dateParser(actual)),expected);
});

test("testing 2dateParser", function() {
  var actual = "2011-01-23 22:15:51.28-06";
  var expected = "\"2011-01-24T04:15:51.280Z\"";
  assert.equal(JSON.stringify(q.dateParser(actual)),expected);
});

test("testing 2dateParser", function() {
  var actual = "2011-01-23 22:15:51.280843-06";
  var expected = "\"2011-01-24T04:15:51.280Z\"";
  assert.equal(JSON.stringify(q.dateParser(actual)),expected);
});


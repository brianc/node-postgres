var helper = require(__dirname + '/test-helper');
var q = {};
q.dateParser = require(__dirname + "/../../../lib/types").getTypeParser(1114, 'text');
q.stringArrayParser = require(__dirname + "/../../../lib/types").getTypeParser(1009, 'text');

test("testing dateParser", function() {
  assert.equal(q.dateParser("2010-12-11 09:09:04").toString(),new Date("2010-12-11 09:09:04").toString());
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

test("testing 2dateParser on dates without timezones", function() {
  var actual = "2010-12-11 09:09:04.1";
  var expected = JSON.stringify(new Date(2010,11,11,9,9,4,100))
  assert.equal(JSON.stringify(q.dateParser(actual)),expected);
});

test("testing 2dateParser on dates with timezones", function() {
  var actual = "2011-01-23 22:15:51.28-06";
  var expected = "\"2011-01-24T04:15:51.280Z\"";
  assert.equal(JSON.stringify(q.dateParser(actual)),expected);
});

test("testing 2dateParser on dates with huge millisecond value", function() {
  var actual = "2011-01-23 22:15:51.280843-06";
  var expected = "\"2011-01-24T04:15:51.280Z\"";
  assert.equal(JSON.stringify(q.dateParser(actual)),expected);
});

test("testing empty array", function(){
  var input = '{}';
  var expected = [];
  assert.deepEqual(q.stringArrayParser(input), expected);
});

test("testing empty string array", function(){
  var input = '{""}';
  var expected = [""];
  assert.deepEqual(q.stringArrayParser(input), expected);
});

test("testing numeric array", function(){
  var input = '{1,2,3,4}';
  var expected = [1,2,3,4];
  assert.deepEqual(q.stringArrayParser(input), expected);
});

test("testing stringy array", function(){
  var input = '{a,b,c,d}';
  var expected = ['a','b','c','d'];
  assert.deepEqual(q.stringArrayParser(input), expected);
});

test("testing stringy array containing escaped strings", function(){
  var input = '{"\\"\\"\\"","\\\\\\\\\\\\"}';
  var expected = ['"""','\\\\\\'];
  assert.deepEqual(q.stringArrayParser(input), expected);
});

test("testing NULL array", function(){
  var input = '{NULL,NULL}';
  var expected = [null,null];
  assert.deepEqual(q.stringArrayParser(input), expected);
});

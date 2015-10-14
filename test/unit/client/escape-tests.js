var helper = require(__dirname + '/test-helper');
var testDateHelper = require('../test-helper');

function createClient(callback) {
  var client = new Client(helper.config);
  client.connect(function(err) {
    return callback(client);
  });
}

var testLit = function(testName, input, expected) {
  test(testName, function(){
    var client = new Client(helper.config);
    var actual = client.escapeLiteral(input);
    assert.equal(expected, actual);
  });
};

var testIdent = function(testName, input, expected) {
  test(testName, function(){
    var client = new Client(helper.config);
    var actual = client.escapeIdentifier(input);
    assert.equal(expected, actual);
  });
};

testLit('escapeLiteral: no special characters',
        'hello world', "'hello world'");

testLit('escapeLiteral: contains double quotes only',
        'hello " world', "'hello \" world'");

testLit('escapeLiteral: contains single quotes only',
        'hello \' world', "'hello \'\' world'");

testLit('escapeLiteral: contains backslashes only',
        'hello \\ world', " E'hello \\\\ world'");

testLit('escapeLiteral: contains single quotes and double quotes',
        'hello \' " world', "'hello '' \" world'");

testLit('escapeLiteral: contains double quotes and backslashes',
        'hello \\ " world', " E'hello \\\\ \" world'");

testLit('escapeLiteral: contains single quotes and backslashes',
        'hello \\ \' world', " E'hello \\\\ '' world'");

testLit('escapeLiteral: contains single quotes, double quotes, and backslashes',
        'hello \\ \' " world', " E'hello \\\\ '' \" world'");

testLit('escapeLiteral: empty string',
        '', "''");

testLit('escapeLiteral: null',
        null, "NULL");

testLit('escapeLiteral: undefined',
        undefined, "NULL");

testLit('escapeLiteral: zero as a string',
        '0', "'0'");

testLit('escapeLiteral: zero as a number',
        0, "0");

testLit('escapeLiteral: number',
        42, "42");

testLit('escapeLiteral: Number object',
        new Number(88), "88");

testLit('escapeLiteral: true',
        true, "TRUE");

testLit('escapeLiteral: false',
        false, "FALSE");

testLit('escapeLiteral: true Boolean object',
        new Boolean(true), "TRUE");

testLit('escapeLiteral: false Boolean object',
        new Boolean(false), "FALSE");

test('escapeLiteral: Date', function(){
  testDateHelper.setTimezoneOffset(420);

  var d = new Date(2015, 9, 27); // note: Javascript month range is 0 - 11  

  var client = new Client(helper.config);
  var actual = client.escapeLiteral(d);
  assert.equal('2015-10-27T00:00:00.000-07:00', actual);

  testDateHelper.resetTimezoneOffset();
});

testLit('escapeLiteral: array',
        ['Nintendo', 64], '{"Nintendo","64"}');

testIdent('escapeIdentifier: no special characters',
        'hello world', '"hello world"');

testIdent('escapeIdentifier: contains double quotes only',
        'hello " world', '"hello "" world"');

testIdent('escapeIdentifier: contains single quotes only',
        'hello \' world', '"hello \' world"');

testIdent('escapeIdentifier: contains backslashes only',
        'hello \\ world', '"hello \\ world"');

testIdent('escapeIdentifier: contains single quotes and double quotes',
        'hello \' " world', '"hello \' "" world"');

testIdent('escapeIdentifier: contains double quotes and backslashes',
        'hello \\ " world', '"hello \\ "" world"');

testIdent('escapeIdentifier: contains single quotes and backslashes',
        'hello \\ \' world', '"hello \\ \' world"');

testIdent('escapeIdentifier: contains single quotes, double quotes, and backslashes',
        'hello \\ \' " world', '"hello \\ \' "" world"');

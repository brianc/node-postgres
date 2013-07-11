var helper = require(__dirname + "/../test-helper");
var Client = require(__dirname + "/../../lib/native");

function createClient() {
  var client = new Client(helper.config);
  client.connect();
  return client;
}

test('escapeLiteral: no special characters', function() {
  var client = createClient();
  var expected = "'hello world'";
  var actual = client.escapeLiteral('hello world');
  assert.equal(expected, actual);
});

test('escapeLiteral: contains double quotes only', function() {
  var client = createClient();
  var expected = "'hello \" world'";
  var actual = client.escapeLiteral('hello " world');
  assert.equal(expected, actual);
});

test('escapeLiteral: contains single quotes only', function() {
  var client = createClient();
  var expected = "'hello \'\' world'";
  var actual = client.escapeLiteral('hello \' world');
  assert.equal(expected, actual);
});

test('escapeLiteral: contains backslashes only', function() {
  var client = createClient();
  var expected = " E'hello \\\\ world'";
  var actual = client.escapeLiteral('hello \\ world');
  assert.equal(expected, actual);
});

test('escapeLiteral: contains single quotes and double quotes', function() {
  var client = createClient();
  var expected = "'hello '' \" world'";
  var actual = client.escapeLiteral('hello \' " world');
  assert.equal(expected, actual);
});

test('escapeLiteral: contains double quotes and backslashes', function() {
  var client = createClient();
  var expected = " E'hello \\\\ \" world'";
  var actual = client.escapeLiteral('hello \\ " world');
  assert.equal(expected, actual);
});

test('escapeLiteral: contains single quotes and backslashes', function() {
  var client = createClient();
  var expected = " E'hello \\\\ '' world'";
  var actual = client.escapeLiteral('hello \\ \' world');
  assert.equal(expected, actual);
});

test('escapeLiteral: contains single quotes, double quotes, and backslashes', function() {
  var client = createClient();
  var expected = " E'hello \\\\ '' \" world'";
  var actual = client.escapeLiteral('hello \\ \' " world');
  assert.equal(expected, actual);
});

test('escapeIdentifier: no special characters', function() {
  var client = createClient();
  var expected = '"hello world"';
  var actual = client.escapeIdentifier('hello world');
  assert.equal(expected, actual);
});

test('escapeIdentifier: contains double quotes only', function() {
  var client = createClient();
  var expected = '"hello "" world"';
  var actual = client.escapeIdentifier('hello " world');
  assert.equal(expected, actual);
});

test('escapeIdentifier: contains single quotes only', function() {
  var client = createClient();
  var expected = '"hello \' world"';
  var actual = client.escapeIdentifier('hello \' world');
  assert.equal(expected, actual);
});

test('escapeIdentifier: contains backslashes only', function() {
  var client = createClient();
  var expected = '"hello \\ world"';
  var actual = client.escapeIdentifier('hello \\ world');
  assert.equal(expected, actual);
});

test('escapeIdentifier: contains single quotes and double quotes', function() {
  var client = createClient();
  var expected = '"hello \' "" world"';
  var actual = client.escapeIdentifier('hello \' " world');
  assert.equal(expected, actual);
});

test('escapeIdentifier: contains double quotes and backslashes', function() {
  var client = createClient();
  var expected = '"hello \\ "" world"';
  var actual = client.escapeIdentifier('hello \\ " world');
  assert.equal(expected, actual);
});

test('escapeIdentifier: contains single quotes and backslashes', function() {
  var client = createClient();
  var expected = '"hello \\ \' world"';
  var actual = client.escapeIdentifier('hello \\ \' world');
  assert.equal(expected, actual);
});

test('escapeIdentifier: contains single quotes, double quotes, and backslashes', function() {
  var client = createClient();
  var expected = '"hello \\ \' "" world"';
  var actual = client.escapeIdentifier('hello \\ \' " world');
  assert.equal(expected, actual);
});

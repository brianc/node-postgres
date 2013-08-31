var helper = require(__dirname + '/test-helper');

function createClient(callback) {
  var client = new Client(helper.config);
  client.connect(function(err) {
    return callback(client);
  });
}

test('escapeLiteral: no special characters', function() {
  createClient(function(client) {
    var expected = "'hello world'";
    var actual = client.escapeLiteral('hello world');
    assert.equal(expected, actual);
    client.end();
  });
});

test('escapeLiteral: contains double quotes only', function() {
  createClient(function(client) {
    var expected = "'hello \" world'";
    var actual = client.escapeLiteral('hello " world');
    assert.equal(expected, actual);
    client.end();
  });
});

test('escapeLiteral: contains single quotes only', function() {
  createClient(function(client) {
    var expected = "'hello \'\' world'";
    var actual = client.escapeLiteral('hello \' world');
    assert.equal(expected, actual);
    client.end();
  });
});

test('escapeLiteral: contains backslashes only', function() {
  createClient(function(client) {
    var expected = " E'hello \\\\ world'";
    var actual = client.escapeLiteral('hello \\ world');
    assert.equal(expected, actual);
    client.end();
  });
});

test('escapeLiteral: contains single quotes and double quotes', function() {
  createClient(function(client) {
    var expected = "'hello '' \" world'";
    var actual = client.escapeLiteral('hello \' " world');
    assert.equal(expected, actual);
    client.end();
  });
});

test('escapeLiteral: contains double quotes and backslashes', function() {
  createClient(function(client) {
    var expected = " E'hello \\\\ \" world'";
    var actual = client.escapeLiteral('hello \\ " world');
    assert.equal(expected, actual);
    client.end();
  });
});

test('escapeLiteral: contains single quotes and backslashes', function() {
  createClient(function(client) {
    var expected = " E'hello \\\\ '' world'";
    var actual = client.escapeLiteral('hello \\ \' world');
    assert.equal(expected, actual);
    client.end();
  });
});

test('escapeLiteral: contains single quotes, double quotes, and backslashes', function() {
  createClient(function(client) {
    var expected = " E'hello \\\\ '' \" world'";
    var actual = client.escapeLiteral('hello \\ \' " world');
    assert.equal(expected, actual);
    client.end();
  });
});

test('escapeIdentifier: no special characters', function() {
  createClient(function(client) {
    var expected = '"hello world"';
    var actual = client.escapeIdentifier('hello world');
    assert.equal(expected, actual);
    client.end();
  });
});

test('escapeIdentifier: contains double quotes only', function() {
  createClient(function(client) {
    var expected = '"hello "" world"';
    var actual = client.escapeIdentifier('hello " world');
    assert.equal(expected, actual);
    client.end();
  });
});

test('escapeIdentifier: contains single quotes only', function() {
  createClient(function(client) {
    var expected = '"hello \' world"';
    var actual = client.escapeIdentifier('hello \' world');
    assert.equal(expected, actual);
    client.end();
  });
});

test('escapeIdentifier: contains backslashes only', function() {
  createClient(function(client) {
    var expected = '"hello \\ world"';
    var actual = client.escapeIdentifier('hello \\ world');
    assert.equal(expected, actual);
    client.end();
  });
});

test('escapeIdentifier: contains single quotes and double quotes', function() {
  createClient(function(client) {
    var expected = '"hello \' "" world"';
    var actual = client.escapeIdentifier('hello \' " world');
    assert.equal(expected, actual);
    client.end();
  });
});

test('escapeIdentifier: contains double quotes and backslashes', function() {
  return createClient(function(client) {
    var expected = '"hello \\ "" world"';
    var actual = client.escapeIdentifier('hello \\ " world');
    assert.equal(expected, actual);
    client.end();
    return;
  });
});

test('escapeIdentifier: contains single quotes and backslashes', function() {
  createClient(function(client) {
    var expected = '"hello \\ \' world"';
    var actual = client.escapeIdentifier('hello \\ \' world');
    assert.equal(expected, actual);
    client.end();
  });
});

test('escapeIdentifier: contains single quotes, double quotes, and backslashes', function() {
  createClient(function(client) {
    var expected = '"hello \\ \' "" world"';
    var actual = client.escapeIdentifier('hello \\ \' " world');
    assert.equal(expected, actual);
    client.end();
  });
});

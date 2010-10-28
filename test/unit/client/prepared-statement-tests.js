var helper = require(__dirname + '/test-helper');

var client = helper.client();
var con = client.connection;
var parseArg = null;
con.parse = function(query) {
  parseArg = query;
};

var bindArg = null;
con.bind = function(arg) {
  bindArg = arg;
  this.emit('bindComplete');
};

var executeArg = null;
con.execute = function(arg) {
  executeArg = arg;
  this.emit('rowData',{ fields: [] });
  this.emit('commandComplete');
};

var describeArg = null;
con.describe = function(arg) {
  describeArg = arg;
  this.emit('rowDescription', { fields: [] });
};

var syncCalled = true;
con.sync = function() {
  syncCalled = false;
  this.emit('readyForQuery')
};

test('bound command', function() {
  test('simple, unnamed bound command', function() {
    return false;
    var query = client.query({
      text: 'select * where name = $1',
      parameters: ['hi']
    });

    test('parse argument', function() {
      assert.equal(parseArg.name, null);
      assert.equal(parseArg.text, 'select * where name = $1');
      assert.equal(parseArg.types, null);
    });

    test('bind argument', function() {
      assert.equal(bindArg.statement, null);
      assert.equal(bindArg.portal, null);
      assert.length(bindArg.values, 1);
      assert.equal(bindArg.values[0], 'hi')
    });

    test('describe argument', function() {
      assert.equal(describeArg, null);
    });

    test('execute argument', function() {
      assert.equal(executeArg.portal, null);
      assert.equal(executeArg.rows, null);
    });

    test('sync called', function() {
      assert.ok(syncCalled);
    });

  });
});

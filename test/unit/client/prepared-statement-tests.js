var helper = require(__dirname + '/test-helper');

var client = helper.client();
var con = client.connection;
var parseArg = null;
con.parse = function(arg) {
  parseArg = arg;
  process.nextTick(function() {
    con.emit('parseComplete');
  });
};

var bindArg = null;
con.bind = function(arg) {
  bindArg = arg;
  process.nextTick(function(){
    con.emit('bindComplete');
  });
};

var executeArg = null;
con.execute = function(arg) {
  executeArg = arg;
  process.nextTick(function() {
    con.emit('rowData',{ fields: [] });
    con.emit('commandComplete', { text: "" });
  });
};

var describeArg = null;
con.describe = function(arg) {
  describeArg = arg;
  process.nextTick(function() {
    con.emit('rowDescription', { fields: [] });
  });
};

var syncCalled = false;
con.flush = function() {
};
con.sync = function() {
  syncCalled = true;
  process.nextTick(function() {
    con.emit('readyForQuery');
  });
};

test('bound command', function() {
  test('simple, unnamed bound command', function() {
    assert.ok(client.connection.emit('readyForQuery'));

    var query = client.query({
      text: 'select * from X where name = $1',
      values: ['hi']
    });

    assert.emits(query,'end', function() {
      test('parse argument', function() {
        assert.equal(parseArg.name, null);
        assert.equal(parseArg.text, 'select * from X where name = $1');
        assert.equal(parseArg.types, null);
      });

      test('bind argument', function() {
        assert.equal(bindArg.statement, null);
        assert.equal(bindArg.portal, null);
        assert.lengthIs(bindArg.values, 1);
        assert.equal(bindArg.values[0], 'hi')
      });

      test('describe argument', function() {
        assert.equal(describeArg.type, 'P');
        assert.equal(describeArg.name, "");
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
});

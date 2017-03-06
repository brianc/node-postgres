var helper = require(__dirname + "/test-helper");
var types = require('pg-types')

test('handles throws in type parsers', function() {
  var typeParserError = new Error('TEST: Throw in type parsers');

  types.setTypeParser('special oid that will throw', function () {
    throw typeParserError;
  });

  test('emits error', function() {
    var handled;
    var client = helper.client();
    var con = client.connection;
    var query = client.query('whatever');

    handled = con.emit('readyForQuery');
    assert.ok(handled, "should have handled ready for query");

    con.emit('rowDescription',{
      fields: [{
        name: 'boom',
        dataTypeID: 'special oid that will throw'
      }]
    });
    assert.ok(handled, "should have handled row description");

    assert.emits(query, 'error', function(err) {
      assert.equal(err, typeParserError);
    });

    handled = con.emit('dataRow', { fields: ["hi"] });
    assert.ok(handled, "should have handled first data row message");

    handled = con.emit('commandComplete', { text: 'INSERT 31 1' });
    assert.ok(handled, "should have handled command complete");

    handled = con.emit('readyForQuery');
    assert.ok(handled, "should have handled ready for query");
  });

  test('calls callback with error', function() {
    var handled;

    var callbackCalled = 0;

    var client = helper.client();
    var con = client.connection;
    var query = client.query('whatever', assert.calls(function (err) {
      callbackCalled += 1;

      assert.equal(callbackCalled, 1);
      assert.equal(err, typeParserError);
    }));

    handled = con.emit('readyForQuery');
    assert.ok(handled, "should have handled ready for query");

    handled = con.emit('rowDescription',{
      fields: [{
        name: 'boom',
        dataTypeID: 'special oid that will throw'
      }]
    });
    assert.ok(handled, "should have handled row description");

    handled = con.emit('dataRow', { fields: ["hi"] });
    assert.ok(handled, "should have handled first data row message");

    handled = con.emit('dataRow', { fields: ["hi"] });
    assert.ok(handled, "should have handled second data row message");

    con.emit('commandComplete', { text: 'INSERT 31 1' });
    assert.ok(handled, "should have handled command complete");

    handled = con.emit('readyForQuery');
    assert.ok(handled, "should have handled ready for query");
  });

  test('rejects promise with error', function() {
    var handled;
    var client = helper.client();
    var con = client.connection;
    var query = client.query('whatever');
    var queryPromise = query.promise();

    handled = con.emit('readyForQuery');
    assert.ok(handled, "should have handled ready for query");

    handled = con.emit('rowDescription',{
      fields: [{
        name: 'boom',
        dataTypeID: 'special oid that will throw'
      }]
    });
    assert.ok(handled, "should have handled row description");

    handled = con.emit('dataRow', { fields: ["hi"] });
    assert.ok(handled, "should have handled first data row message");

    handled = con.emit('commandComplete', { text: 'INSERT 31 1' });
    assert.ok(handled, "should have handled command complete");

    handled = con.emit('readyForQuery');
    assert.ok(handled, "should have handled ready for query");

    queryPromise.catch(assert.calls(function (err) {
      assert.equal(err, typeParserError);
    }));
  });

});

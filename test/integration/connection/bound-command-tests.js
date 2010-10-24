var helper = require(__dirname + '/test-helper');
http://developer.postgresql.org/pgdocs/postgres/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY

test('flushing once', function() {
  helper.connect(function(con) {

    assert.raises(con, 'parseComplete');
    assert.raises(con, 'bindComplete');
    assert.raises(con, 'dataRow');
    assert.raises(con, 'commandComplete');
    assert.raises(con, 'commandComplete');
    assert.raises(con, 'readyForQuery');

    con.parse({
      text: 'select * from ids'
    });
    con.bind();
    con.execute();
    con.flush();
    con.on('commandComplete', function() {
      con.sync();
    });
    con.on('readyForQuery', function() {
      con.end();
    });
  });
});

test("sending many flushes", function() {
  helper.connect(function(con) {

    assert.raises(con, 'parseComplete');
    assert.raises(con, 'bindComplete');
    assert.raises(con, 'dataRow');
    assert.raises(con, 'commandComplete');
    assert.raises(con, 'commandComplete');
    assert.raises(con, 'readyForQuery');

    con.parse({
      text: 'select * from ids'
    });

    con.flush();

    con.once('parseComplete', function() {
      con.bind();
      con.flush();
    });

    con.once('bindComplete', function() {
      con.execute();
      con.flush();
    });

    con.once('commandComplete', function() {
      con.sync();
    });

    con.once('readyForQuery', function() {
      con.end();
    });

  });
});

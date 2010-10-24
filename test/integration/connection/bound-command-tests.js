var helper = require(__dirname + '/test-helper');
http://developer.postgresql.org/pgdocs/postgres/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY

helper.connect(function(con) {

  con.parse({
    text: 'select * from ids'
  });
  con.flush();

  con.once('parseComplete', function() {
    console.log('parseComplete');
    con.bind();
    con.flush();
  });

  con.once('bindComplete', function() {
    console.log('bindComplete');
    con.execute();
    con.flush();
  });

  con.on('dataRow', function(msg) {
    sys.debug("got row from pepared query");
  });

  con.on('commandComplete', function() {
    con.sync();
  });

  con.on('readyForQuery', function() {
    con.end();
  });

});


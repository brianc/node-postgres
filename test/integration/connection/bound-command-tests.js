var helper = require(__dirname + '/test-helper');
http://developer.postgresql.org/pgdocs/postgres/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY

helper.connect(function(con) {
  con.on('message', function(msg) {
    console.log(msg.name);
  });

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

  con.once('dataRow', function(msg) {
    console.log("row: " + sys.inspect(msg));
  });

  con.once('commandComplete', function() {
    con.sync();
  });

  con.once('readyForQuery', function() {
    con.end();
  });

});


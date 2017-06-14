var helper = require('../test-helper');

helper.pg.connect(function(err,client) {
  var q = {
    name: 'This is a super long query name just so I can test that an error message is properly spit out to console.error without throwing an exception or anything',
    text: 'SELECT NOW()'
  };
  client.query(q, function() {
    client.end();
  });
});

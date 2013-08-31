var helper = require(__dirname+"/test-helper");
var assert = require('assert');

test('COPY FROM events check', function () {
 helper.connect(function (con) {
    var stdinStream = con.query('COPY person FROM STDIN'); 
    con.on('copyInResponse', function () {
      con.endCopyFrom(); 
    });
    assert.emits(con, 'copyInResponse',
      function () {
        con.endCopyFrom();
      },
      "backend should  emit copyInResponse after COPY FROM query"
    ); 
    assert.emits(con, 'commandComplete',
      function () {
        con.end();
      },
      "backend should emit commandComplete after COPY FROM stream ends"
    )
  });
});
test('COPY TO events check', function () {
  helper.connect(function (con) {
    var stdoutStream = con.query('COPY person TO STDOUT');
    assert.emits(con, 'copyOutResponse',
      function () {
      },
      "backend should emit copyOutResponse after COPY TO query"
    );
    assert.emits(con, 'copyData',
      function () {
      },
      "backend should emit copyData on every data row"
    );
    assert.emits(con, 'copyDone',
      function () {
        con.end();
      },
      "backend should emit copyDone after all data rows"
    );
  });
});

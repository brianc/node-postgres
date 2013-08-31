var helper = require(__dirname+"/../test-helper");
var Client = require(__dirname + "/../../lib/native");
test('COPY FROM events check', function () {
  var con = new Client(helper.config),
    stdinStream = con.copyFrom('COPY person FROM STDIN');
  assert.emits(con, 'copyInResponse',
    function () {
      stdinStream.end();
    },
    "backend should  emit copyInResponse after COPY FROM query"
  ); 
  assert.emits(con, '_readyForQuery',
    function () {
      con.end();
    },
    "backend should  emit _readyForQuery after data will be coped to stdin stream"
  ); 
  con.connect();
});
test('COPY TO events check', function () {
  var con = new Client(helper.config),
    stdoutStream = con.copyTo('COPY person TO STDOUT');
  assert.emits(con, 'copyOutResponse',
    function () {},
    "backend should emit copyOutResponse on copyOutResponse message from server"
  );
  assert.emits(con, 'copyData',
    function () {
    },
    "backend should  emit copyData on every data row"
  ); 
  assert.emits(con, '_readyForQuery',
    function () {
      con.end();
    },
    "backend should  emit _readyForQuery after data will be coped to stdout stream"
  ); 
  con.connect();
});


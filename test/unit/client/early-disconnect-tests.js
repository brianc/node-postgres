var helper = require(__dirname + '/test-helper');
var net = require('net');
var pg = require('../../..//lib/index.js');

/* console.log() messages show up in `make test` output. TODO: fix it. */
var server = net.createServer(function(c) {
  console.log('server connected');
  c.destroy();
  console.log('server socket destroyed.');
  server.close(function() { console.log('server closed'); });
});

server.listen(7777, function() {
  console.log('server listening');
  var client = new pg.Client('postgres://localhost:7777');
  console.log('client connecting');
  client.connect(assert.calls(function(err) {
    if (err) console.log("Error on connect: "+err);
    else console.log('client connected');
    assert(err);
  }));

});

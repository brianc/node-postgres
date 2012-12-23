var helper = require(__dirname + '/../test-helper');
var CopyFromStream =  require(__dirname + '/../../../lib/copystream').CopyFromStream;
var ConnectionImitation = function () {
  this.send = 0;
  this.hasToBeSend = 0;
  this.finished = 0;
};
ConnectionImitation.prototype = {
  endCopyFrom: function () {
    assert.ok(this.finished++ === 0, "end shoud be called only once");
    assert.equal(this.send, this.hasToBeSend, "at the moment of the end all data has to be sent");
  },
  sendCopyFromChunk: function (chunk) {
    this.send += chunk.length; 
    return true;
  },
  updateHasToBeSend: function (chunk) {
    this.hasToBeSend += chunk.length;
    return chunk;
  }
};
var buf1 = new Buffer("asdfasd"),
  buf2 = new Buffer("q03r90arf0aospd;"),
  buf3 = new Buffer(542),
  buf4 = new Buffer("93jfemialfjkasjlfas");

test('stream has to finish data stream to connection exactly once', function () {
  var stream = new CopyFromStream();
  var conn = new ConnectionImitation();
  stream.on('drain', function () {
    assert.ok(false, "there has not be drain event");
  });
  stream.startStreamingToConnection(conn);
  assert.ok(stream.write(conn.updateHasToBeSend(buf1)));
  assert.ok(stream.write(conn.updateHasToBeSend(buf2)));
  assert.ok(stream.write(conn.updateHasToBeSend(buf3)));
  assert.ok(stream.writable, "stream has to be writable");
  stream.end(conn.updateHasToBeSend(buf4));
  assert.ok(!stream.writable, "stream has not to be writable");
  stream.end();
});
test('', function () {
  var stream = new CopyFromStream();
  assert.emits(stream, 'drain', function() {}, 'drain have to be emitted');
  var conn = new ConnectionImitation() 
  assert.ok(!stream.write(conn.updateHasToBeSend(buf1)));
  assert.ok(!stream.write(conn.updateHasToBeSend(buf2)));
  assert.ok(!stream.write(conn.updateHasToBeSend(buf3)));
  assert.ok(stream.writable, "stream has to be writable");
  stream.end(conn.updateHasToBeSend(buf4));
  assert.ok(!stream.writable, "stream has not to be writable");
  stream.end();
  stream.startStreamingToConnection(conn);
});
test('', function () {
  var stream = new CopyFromStream();
  var conn = new ConnectionImitation() 
  assert.emits(stream, 'drain', function() {}, 'drain have to be emitted');
  stream.write(conn.updateHasToBeSend(buf1));
  stream.write(conn.updateHasToBeSend(buf2));
  stream.startStreamingToConnection(conn);
  stream.write(conn.updateHasToBeSend(buf3));
  assert.ok(stream.writable, "stream has to be writable");
  stream.end(conn.updateHasToBeSend(buf4));
  assert.ok(!stream.writable, "stream has not to be writable");
  stream.end();
});
test('', function () {
  var stream = new CopyFromStream();
  var conn = new ConnectionImitation() 
  assert.emits(stream, 'drain', function() {}, 'drain have to be emitted');
  stream.write(conn.updateHasToBeSend(buf1));
  stream.write(conn.updateHasToBeSend(buf2));
  stream.write(conn.updateHasToBeSend(buf3));
  stream.startStreamingToConnection(conn);
  assert.ok(stream.writable, "stream has to be writable");
  stream.end(conn.updateHasToBeSend(buf4));
  assert.ok(!stream.writable, "stream has not to be writable");
  stream.end();
});
test('', function(){
  var stream = new CopyFromStream();
  var conn = new ConnectionImitation() 
  assert.emits(stream, 'drain', function() {}, 'drain have to be emitted');
  stream.write(conn.updateHasToBeSend(buf1));
  stream.write(conn.updateHasToBeSend(buf2));
  stream.write(conn.updateHasToBeSend(buf3));
  stream.startStreamingToConnection(conn);
  assert.ok(stream.writable, "stream has to be writable");
  stream.end(conn.updateHasToBeSend(buf4));
  stream.startStreamingToConnection(conn);
  assert.ok(!stream.writable, "stream has not to be writable");
  stream.end();
});

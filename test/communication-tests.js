require(__dirname+'/test-helper');

var MemoryStream = function() {
  EventEmitter.call(this);
};

sys.inherits(MemoryStream, EventEmitter);

var p = MemoryStream.prototype;

test('client can take existing stream', function() {
  var stream = new MemoryStream();
  var client = new Client({
    stream: stream
  });
  assert.equal(client.stream, stream);
});

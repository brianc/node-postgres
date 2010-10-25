require(__dirname+'/../test-helper');
MemoryStream = function() {
  EventEmitter.call(this);
  this.packets = [];
};

sys.inherits(MemoryStream, EventEmitter);

var p = MemoryStream.prototype;

p.write = function(packet) {
  this.packets.push(packet);
};

createClient = function() {
  var stream = new MemoryStream();
  stream.readyState = "open";
  var client = new Client({
    connection: new Connection({stream: stream})
  });
  client.connect();
  return client;
};

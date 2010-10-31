var Writer = function() {
  this.buffers = [];
};

var p = Writer.prototype;

p.add = function(buffer) {
  this.buffers.push(buffer);
  return this;
};

p.addInt16 = function(val, front) {
  return this.add(Buffer([
    (val >>> 8),
    (val >>> 0)
  ]));
};

p.getByteLength = function(initial) {
  return this.buffers.reduce(function(previous, current){
    return previous + current.length;
  },initial || 0);
};

p.addInt32 = function(val, first) {
  return this.add(Buffer([
    (val >>> 24 & 0xFF),
    (val >>> 16 & 0xFF),
    (val >>> 8 & 0xFF),
    (val >>> 0 & 0xFF)
  ]));
};

p.addCString = function(val) {
  return this.add(Buffer(val + '\0','utf8'));
};

p.addChar = function(char, first) {
  return this.add(Buffer(char,'utf8'), first);
};

p.join = function() {
  var result = Buffer(this.getByteLength());
  var index = 0;
  var buffers = this.buffers;
  var length = this.buffers.length;
  for(var i = 0; i < length; i ++) {
    var buffer = buffers[i];
    buffer.copy(result, index, 0);
    index += buffer.length;
  }
  return result;
};

module.exports = Writer;


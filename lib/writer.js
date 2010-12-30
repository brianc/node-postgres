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
  var totalBufferLength = 0;
  var buffers = this.buffers;
  for(var i = 0, len = buffers.length; i < len; i++) {
    totalBufferLength += buffers[i].length;
  }
  return totalBufferLength;
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
  var len = Buffer.byteLength(val);
  var buffer = new Buffer(len+1);
  buffer.write(val);
  buffer[len] = 0;
  return this.add(buffer);
};

p.addChar = function(char, first) {
  return this.add(Buffer(char,'utf8'), first);
};

p.join = function() {
  var length = this.buffers.length;
  if(length===1) {
    return this.buffers[0]
  }
  var result = Buffer(this.getByteLength());
  var index = 0;
  var buffers = this.buffers;
  for(var i = 0; i < length; i ++) {
    var buffer = buffers[i];
    buffer.copy(result, index, 0);
    index += buffer.length;
  }
  return result;
};

module.exports = Writer;


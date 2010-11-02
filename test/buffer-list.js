BufferList = function() {
  this.buffers = [];
};
var p = BufferList.prototype;

p.add = function(buffer, front) {
  this.buffers[front ? "unshift" : "push"](buffer);
  return this;
};

p.addInt16 = function(val, front) {
  return this.add(Buffer([(val >>> 8),(val >>> 0)]),front);
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
  ]),first);
};

p.addCString = function(val, front) {
  var len = Buffer.byteLength(val);
  var buffer = new Buffer(len+1);
  buffer.write(val);
  buffer[len] = 0;
  return this.add(buffer, front);
};

p.addChar = function(char, first) {
  return this.add(Buffer(char,'utf8'), first);
};

p.join = function(appendLength, char) {
  var length = this.getByteLength();
  if(appendLength) {
    this.addInt32(length+4, true);
    return this.join(false, char);
  }
  if(char) {
    this.addChar(char, true);
    length++;
  }
  var result = Buffer(length);
  var index = 0;
  this.buffers.forEach(function(buffer) {
    buffer.copy(result, index, 0);
    index += buffer.length;
  });
  return result;
};

BufferList.concat = function() {
  var total = new BufferList();
  for(var i = 0; i < arguments.length; i++) {
    total.add(arguments[i]);
  }
  return total.join();
};

module.exports = BufferList;

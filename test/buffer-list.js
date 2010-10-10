BufferList = function() {
  this.buffers = [];
};

BufferList.prototype.add = function(buffer, front) {
  this.buffers[front ? "unshift" : "push"](buffer);
  return this;
};

BufferList.prototype.addInt16 = function(val, front) {
  return this.add(Buffer([(val >>> 8),(val >>> 0)]),front);
};

BufferList.prototype.getByteLength = function(initial) {
  return this.buffers.reduce(function(previous, current){
    return previous + current.length;
  },initial || 0);
};

BufferList.prototype.addInt32 = function(val, first) {
  return this.add(Buffer([
    (val >>> 24),
    (val >>> 16),
    (val >>> 8),
    (val >>> 0)
  ]),first);
};

BufferList.prototype.addCString = function(val) {
  return this.add(Buffer(val + '\0','utf8'));
};

BufferList.prototype.addChar = function(char, first) {
  return this.add(Buffer(char,'utf8'), first);
};

BufferList.prototype.join = function(appendLength, char) {
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

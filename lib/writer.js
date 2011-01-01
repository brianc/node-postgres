var ElasticBuffer = function(size) {
  this.size = size || 1024;
  this.buffer = new Buffer(this.size);
  this.offset = 0;
};

var p = ElasticBuffer.prototype;

p._remaining = function() {
  return this.buffer.length - this.offset;
}

p._resize = function() {
  var oldBuffer = this.buffer;
  this.buffer = Buffer(oldBuffer.length + this.size);
  oldBuffer.copy(this.buffer);
}

//resizes internal buffer if not enough size left
p._ensure = function(size) {
  if(this._remaining() < size) {
    this._resize()
  }
}

p.addInt32 = function(num) {
  this._ensure(4)
  this.buffer[this.offset++] = (num >>> 24 & 0xFF)
  this.buffer[this.offset++] = (num >>> 16 & 0xFF)
  this.buffer[this.offset++] = (num >>>  8 & 0xFF)
  this.buffer[this.offset++] = (num >>>  0 & 0xFF)
  return this;
}

p.addInt16 = function(num) {
  this._ensure(2)
  this.buffer[this.offset++] = (num >>>  8 & 0xFF)
  this.buffer[this.offset++] = (num >>>  0 & 0xFF)
  return this;
}

p.addCString = function(string) {
  var string = string || "";
  var len = Buffer.byteLength(string) + 1;
  this._ensure(len);
  this.buffer.write(string, this.offset);
  this.offset += len;
  this.buffer[this.offset] = 0; //add null terminator
  return this;  
}

p.addChar = function(char) {
  this._ensure(1);
  this.buffer.write(char, this.offset);
  this.offset++;
  return this;
}

p.join = function() {
  return this.buffer.slice(0, this.offset);
}

p.getByteLength = function() {
  return this.offset;
}

p.add = function(otherBuffer) {
  this._ensure(otherBuffer.length);
  otherBuffer.copy(this.buffer, this.offset);
  this.offset += otherBuffer.length;
  return this;
}

module.exports = ElasticBuffer;

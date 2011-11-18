//binary data writer tuned for creating
//postgres message packets as effeciently as possible by reusing the
//same buffer to avoid memcpy and limit memory allocations
var Writer = function(size) {
  this.size = size || 1024;
  this.buffer = Buffer(this.size + 5);
  this.offset = 5;
  this.headerPosition = 0;
};

var p = Writer.prototype;

//resizes internal buffer if not enough size left
p._ensure = function(size) {
  var remaining = this.buffer.length - this.offset;
  if(remaining < size) {
    var oldBuffer = this.buffer;
    this.buffer = new Buffer(oldBuffer.length + size);
    oldBuffer.copy(this.buffer);
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

//for versions of node requiring 'length' as 3rd argument to buffer.write
var writeString = function(buffer, string, offset, len) {
  buffer.write(string, offset, len);
}

//overwrite function for older versions of node
if(Buffer.prototype.write.length === 3) {
  writeString = function(buffer, string, offset, len) {
    buffer.write(string, offset);
  }
}

p.addCString = function(string) {
  //just write a 0 for empty or null strings
  if(!string) {
    this._ensure(1);
  } else {
    var len = Buffer.byteLength(string);
    this._ensure(len + 1); //+1 for null terminator
    writeString(this.buffer, string, this.offset, len);
    this.offset += len;
  }

  this.buffer[this.offset++] = 0; // null terminator
  return this;
}

p.addChar = function(char) {
  this._ensure(1);
  writeString(this.buffer, char, this.offset, 1);
  this.offset++;
  return this;
}

p.addString = function(string) {
  var string = string || "";
  var len = Buffer.byteLength(string);
  this._ensure(len);
  this.buffer.write(string, this.offset);
  this.offset += len;
  return this;
}

p.getByteLength = function() {
  return this.offset - 5;
}

p.add = function(otherBuffer) {
  this._ensure(otherBuffer.length);
  otherBuffer.copy(this.buffer, this.offset);
  this.offset += otherBuffer.length;
  return this;
}

p.clear = function() {
  this.offset = 5;
  this.headerPosition = 0;
  this.lastEnd = 0;
}

//appends a header block to all the written data since the last
//subsequent header or to the beginning if there is only one data block
p.addHeader = function(code, last) {
  var origOffset = this.offset;
  this.offset = this.headerPosition;
  this.buffer[this.offset++] = code;
  //length is everything in this packet minus the code
  this.addInt32(origOffset - (this.headerPosition+1))
  //set next header position
  this.headerPosition = origOffset;
  //make space for next header
  this.offset = origOffset;
  if(!last) {
    this._ensure(5);
    this.offset += 5;
  }
}

p.join = function(code) {
  if(code) {
    this.addHeader(code, true);
  }
  return this.buffer.slice(code ? 0 : 5, this.offset);
}

p.flush = function(code) {
  var result = this.join(code);
  this.clear();
  return result;
}

module.exports = Writer;

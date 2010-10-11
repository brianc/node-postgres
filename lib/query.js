var EventEmitter = require('events').EventEmitter;

var Query = function() {
  EventEmitter.call(this);
};

sys.inherits(Query, EventEmitter);

Query.prototype.toBuffer = function() {
  var textBuffer = new Buffer(this.text+'\0','utf8');
  var len = textBuffer.length + 4;
  var fullBuffer = new Buffer(len + 1);
  fullBuffer[0] = 0x51;
  fullBuffer[1] = len >>> 24;
  fullBuffer[2] = len >>> 16;
  fullBuffer[3] = len >>> 8;
  fullBuffer[4] = len >>> 0;
  textBuffer.copy(fullBuffer,5,0);
  return fullBuffer;
};

module.exports = Query;

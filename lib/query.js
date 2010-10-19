var EventEmitter = require('events').EventEmitter;
var sys = require('sys');

var Query = function() {
  EventEmitter.call(this);
};

sys.inherits(Query, EventEmitter);

var intParser = {
  fromDbValue: parseInt
};

Query.dataTypes = {
  20: intParser,
  21: intParser,
  23: intParser
};

var p = Query.prototype;

p.processRowDescription = function(description) {
  this.fields = description.fields;
};

p.processDataRow = function(dataRow) {
  var row = dataRow.fields;
  var fields = this.fields || [];
  var field, dataType;
  for(var i = 0, len = row.length; i < len; i++) {
    field = fields[i] || 0
    var dataType = Query.dataTypes[field.dataTypeID];
    if(dataType) {
      console.log('found data type');
      row[i] = dataType.fromDbValue(row[i]);
    }
  }
  this.emit('row',row);
};

p.toBuffer = function() {
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

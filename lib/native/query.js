var EventEmitter = require('events').EventEmitter;
var util = require('util');

var types = require(__dirname + '/../types');
var utils = require(__dirname + '/../utils');
var Result = require(__dirname + '/../result');

//event emitter proxy
var NativeQuery = function(text, values, callback) {
  EventEmitter.call(this);

  this.text = null;
  this.values = null;
  this.callback = null;
  this.name = null;
  
  //allow 'config object' as first parameter
  if(typeof text == 'object') {
    this.text = text.text;
    this.values = text.values;
    this.name = text.name;
    if(typeof values === 'function') {
      this.callback = values;
    } else if(values) {
      this.values = values;
      this.callback = callback;
    }
  } else {
    this.text = text;
    this.values = values;
    this.callback = callback;
    if(typeof values == 'function') {
      this.values = null;
      this.callback = values;
    }
  }
  this._result = new Result();
  //normalize values
  if(this.values) {
    for(var i = 0, len = this.values.length; i < len; i++) {
      this.values[i] = utils.prepareValue(this.values[i]);
    }
  }
};

util.inherits(NativeQuery, EventEmitter);
var p = NativeQuery.prototype;

//maps from native rowdata into api compatible row object
var mapRowData = function(row) {
  var result = {};
  for(var i = 0, len = row.length; i < len; i++) {
    var item = row[i];    
    result[item.name] = item.value == null ? null : types.getTypeParser(item.type, 'text')(item.value);
  }
  return result;
}

p.handleRow = function(rowData) {
  var row = mapRowData(rowData);
  if(this.callback) {
    this._result.addRow(row);
  }
  this.emit('row', row, this._result);
};

p.handleError = function(error) {
  if(this.callback) {
    this.callback(error);
    this.callback = null;
  } else {
    this.emit('error', error);
  }
}

p.handleReadyForQuery = function(meta) {
  if(meta) {
    this._result.addCommandComplete(meta);
  }
  if(this.callback) {
    this.callback(null, this._result);
  }
  this.emit('end', this._result);
};

module.exports = NativeQuery;

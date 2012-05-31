var EventEmitter = require('events').EventEmitter;
var util = require('util');

var types = require(__dirname + "/../types");

//event emitter proxy
var NativeQuery = function(text, values, callback) {
  //TODO there are better ways to detect overloads
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
  if(this.callback) {
    this.rows = [];
  }
  //normalize values
  if(this.values) {
    for(var i = 0, len = this.values.length; i < len; i++) {
      var item = this.values[i];
      switch(typeof item) {
      case 'undefined':
        this.values[i] = null;
        break;
      case 'object':
        this.values[i] = item === null ? null : JSON.stringify(item);
        break;
      case 'string':
        //value already string
        break;
      default:
        //numbers
        this.values[i] = item.toString();
      }
    }
  }

  EventEmitter.call(this);
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
    this.rows.push(row);
  }
  this.emit('row', row);
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
  if(this.callback) {
    (meta || {}).rows = this.rows;
    this.callback(null, meta);
  }
  this.emit('end');
};

module.exports = NativeQuery;

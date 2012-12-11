var EventEmitter = require('events').EventEmitter;
var util = require('util');

var types = require(__dirname + '/../types');
var utils = require(__dirname + '/../utils');
var Result = require(__dirname + '/../result');

//event emitter proxy
var NativeQuery = function(config) {
  EventEmitter.call(this);

  if (config) {
    this._init(config)
  }

  this._result = new Result();
};

util.inherits(NativeQuery, EventEmitter);
var p = NativeQuery.prototype;

p._init = function (config) {
  this.text = config.text;
  this.values = config.values;
  this.name = config.name;
  this.callback = config.callback;
  //normalize values
  if(this.values) {
    for(var i = 0, len = this.values.length; i < len; i++) {
      this.values[i] = utils.prepareValue(this.values[i]);
    }
  }
  this._init = null
}

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
  if(this.callback) {
    this._result.command = meta.command.split(' ')[0];
    this._result.rowCount = parseInt(meta.value);
    this.callback(null, this._result);
  }
  this.emit('end', this._result);
};

module.exports = NativeQuery;

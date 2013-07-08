var EventEmitter = require('events').EventEmitter;
var util = require('util');

var types = require(__dirname + '/../types/');
var utils = require(__dirname + '/../utils');
var Result = require(__dirname + '/../result');

//event emitter proxy
var NativeQuery = function(config, values, callback) {
  // use of "new" optional
  if (!(this instanceof NativeQuery)) {
    return new NativeQuery(config, values, callback);
  }

  EventEmitter.call(this);

  var c = utils.normalizeQueryConfig(config, values, callback);

  this.name = c.name;
  this.text = c.text;
  this.values = c.values;
  this.callback = c.callback;

  this._result = new Result();
  this._addedFields = false;
  //normalize values
  if(this.values) {
    for(var i = 0, len = this.values.length; i < len; i++) {
      this.values[i] = utils.prepareValue(this.values[i]);
    }
  }
  this._canceledDueToError = false;
};

util.inherits(NativeQuery, EventEmitter);

//maps from native rowdata into api compatible row object
var mapRowData = function(row) {
  var result = {};
  for(var i = 0, len = row.length; i < len; i++) {
    var item = row[i];
    result[item.name] = item.value === null ? null :
      types.getTypeParser(item.dataTypeID, 'text')(item.value);
  }
  return result;
};

NativeQuery.prototype.handleRowDescription = function(rowDescription) {
  //multiple query statements in 1 action can result in multiple sets
  //of rowDescriptions...eg: 'select NOW(); select 1::int;'
  if(this._result.fields.length) {
    this._result.fields = [];
  }
  for(var i = 0, len = rowDescription.length; i < len; i++) {
    this._result.addField(rowDescription[i]);
  }
};

NativeQuery.prototype.handleRow = function(rowData) {
  var row = {};
  for(var i = 0, len = rowData.length; i < len; i++) {
    var rawValue = rowData[i];
    var field = this._result.fields[i];
    var fieldType = field.dataTypeID;
    var parsedValue = null;
    if(rawValue !== null) {
      parsedValue = types.getTypeParser(fieldType, 'text')(rawValue);
    }
    var fieldName = field.name;
    row[fieldName] = parsedValue;
  }
  if(this.callback) {
    this._result.addRow(row);
  }
  this.emit('row', row, this._result);
};

NativeQuery.prototype.handleError = function(error) {
  if (this._canceledDueToError) {
    error = this._canceledDueToError;
    this._canceledDueToError = false;
  }
  if(this.callback) {
    var cb = this.callback;
    //remove callback to prevent double call on readyForQuery
    this.callback = null;
    cb(error);
  } else {
    this.emit('error', error);
  }
};

NativeQuery.prototype.handleReadyForQuery = function(meta) {
  if (this._canceledDueToError) {
    return this.handleError(this._canceledDueToError);
  }
  if(meta) {
    this._result.addCommandComplete(meta);
  }
  if(this.callback) {
    this.callback(null, this._result);
  }
  this.emit('end', this._result);
};

NativeQuery.prototype.streamData = function (connection) {
  if(this.stream) {
    this.stream.startStreamingToConnection(connection);
  }
  else {
    connection.sendCopyFail('No source stream defined');
  }
};

NativeQuery.prototype.handleCopyFromChunk = function (chunk) {
  if(this.stream) {
    this.stream.handleChunk(chunk);
  }
  //if there are no stream (for example when copy to query was sent by
  //query method instead of copyTo) error will be handled
  //on copyOutResponse event, so silently ignore this error here
};

module.exports = NativeQuery;

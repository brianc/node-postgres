var EventEmitter = require('events').EventEmitter;
var util = require('util');

var types = require(__dirname + '/../types');
var utils = require(__dirname + '/../utils');
var Result = require(__dirname + '/../result');

//event emitter proxy
var NativeQuery = function(config, values, callback) {
  // use of "new" optional
  if (!(this instanceof NativeQuery)) {
    return new NativeQuery(config, values, callback);
  }

  EventEmitter.call(this);

  config = utils.normalizeQueryConfig(config, values, callback);

	this.name = config.name;
  this.text = config.text;
  this.values = config.values;
  this.callback = config.callback;

  this._result = new Result();
  //normalize values
  if(this.values) {
    for(var i = 0, len = this.values.length; i < len; i++) {
      this.values[i] = utils.prepareValue(this.values[i]);
    }
  }
  this._canceledDueToError = false;
};

util.inherits(NativeQuery, EventEmitter);
var p = NativeQuery.prototype;

//maps from native rowdata into api compatible row object
var mapRowData = function(row) {
  var result = {};
  for(var i = 0, len = row.length; i < len; i++) {
    var item = row[i];
    result[item.name] = item.value === null ? null :
      types.getTypeParser(item.type, 'text')(item.value);
  }
  return result;
};

p.handleRow = function(rowData) {
  var row = mapRowData(rowData);
  if(this.callback) {
    this._result.addRow(row);
  }
  this.emit('row', row, this._result);
};

p.handleError = function(error) {
  if (this._canceledDueToError) {
    error = this._canceledDueToError;
    this._canceledDueToError = false;
  }
  if(this.callback) {
    this.callback(error);
    this.callback = null;
  } else {
    this.emit('error', error);
  }
};

p.handleReadyForQuery = function(meta) {
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
p.streamData = function (connection) {
  if ( this.stream ) this.stream.startStreamingToConnection(connection);
  else connection.sendCopyFail('No source stream defined');
};
p.handleCopyFromChunk = function (chunk) {
  if ( this.stream ) {
    this.stream.handleChunk(chunk);
  }
  //if there are no stream (for example when copy to query was sent by
  //query method instead of copyTo) error will be handled
  //on copyOutResponse event, so silently ignore this error here
};
module.exports = NativeQuery;

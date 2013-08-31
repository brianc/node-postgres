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

  this._result = new Result(config.rowMode);
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

NativeQuery.prototype.handleRowDescription = function(rowDescription) {
  this._result.addFields(rowDescription);
};

NativeQuery.prototype.handleRow = function(rowData) {
  var row = this._result.parseRow(rowData);
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

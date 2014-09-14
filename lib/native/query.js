var EventEmitter = require('events').EventEmitter;
var util = require('util');

var NativeQuery = module.exports = function(native) {
  EventEmitter.call(this);
  this.native = native;
  this.text = null;
  this.values = null;
  this.name = null;
  this.callback = null;
  this.state = 'new';

  //if the 'row' event is listened for
  //then emit them as they come in
  //without setting singleRowMode to true
  //this has almost no meaning because libpq
  //reads all rows into memory befor returning any
  this._emitRowEvents = false;
  this.once('newListener', function(event) {
    if(event === 'row') this._emitRowEvents = true;
  }.bind(this));
};

util.inherits(NativeQuery, EventEmitter);

NativeQuery.prototype.submit = function() {
  this.state = 'running';
  var self = this;

  var after = function(err, rows) {
    setImmediate(function() {
      self.emit('_done');
    });

    //handle possible query error
    if(err) {
      self.state = 'error';
      if(self.callback) return self.callback(err);
      return self.emit('error', err);
    }

    //emit row events for each row in the result
    if(self._emitRowEvents) {
      rows.forEach(self.emit.bind(self, 'row'));
    }

    //handle successful result
    self.state = 'end';
    self.emit('end');
    if(self.callback) {
      self.callback(null, {rows: rows})
    }
  }

  if(this.values) {
    this.native.query(this.text, this.values, after);
  } else {
    this.native.query(this.text, after);
  }
};

return;

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
  if(process.domain && c.callback) {
    this.callback = process.domain.bind(c.callback);
  }
  this.singleRowMode = false;

  if(!this.callback) {
    this.singleRowMode = true;
  }

  this._result = new Result(config.rowMode);
  this._addedFields = false;
  this._hadError = false;
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
  this._hadError = true;
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
  if(this._hadError) return;
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

var Stream = require('stream').Stream;
var util = require('util');
var CopyFromStream = function () {
  Stream.apply(this, arguments);
  this._buffer = new Buffer(0);
  this._connection = false;
  this._finished  = false;
  this._finishedSent = false;
  this._closed = false;
  this._error = false;
  this._dataBuffered = false;
  this.__defineGetter__("writable", this._writable.bind(this));
};

util.inherits(CopyFromStream, Stream);

CopyFromStream.prototype._writable = function () {
  return !(this._finished || this._error);
};

CopyFromStream.prototype.startStreamingToConnection = function (connection) {
  if(this._error) {
    return;
  }
  this._connection = connection;
  this._sendIfConnectionReady();
  this._endIfNeedAndPossible();
};

CopyFromStream.prototype._handleChunk = function (string, encoding) {
  var dataChunk,
    tmpBuffer;
  if(string !== undefined) {
    if(string instanceof Buffer) {
      dataChunk = string;
    } else {
      dataChunk = new Buffer(string, encoding);
    }
    if(this._buffer.length) {
      //Buffer.concat is better, but it's missing
      //in node v0.6.x
      tmpBuffer = new Buffer(this._buffer.length + dataChunk.length);
      this._buffer.copy(tmpBuffer);
      dataChunk.copy(tmpBuffer, this._buffer.length);
      this._buffer = tmpBuffer;
    } else {
      this._buffer = dataChunk;
    }
  }

  return this._sendIfConnectionReady();
};

CopyFromStream.prototype._sendIfConnectionReady = function () {
  var dataSent = false;
  if(this._connection) {
    dataSent = this._connection.sendCopyFromChunk(this._buffer);
    this._buffer = new Buffer(0);
    if(this._dataBuffered) {
      this.emit('drain');
    }
    this._dataBuffered = false;
  } else {
    this._dataBuffered = true;
  }
  return dataSent;
};

CopyFromStream.prototype._endIfNeedAndPossible = function () {
  if(this._connection && this._finished && !this._finishedSent) {
    this._finishedSent = true;
    this._connection.endCopyFrom();
  }
};

CopyFromStream.prototype.write = function (string, encoding) {
  if(this._error || this._finished) {
    return false;
  }
  return this._handleChunk.apply(this, arguments);
};

CopyFromStream.prototype.end = function (string, encondig) {
  if(this._error || this._finished) {
    return false;
  }
  this._finished = true;
  if(string !== undefined) {
    this._handleChunk.apply(this, arguments);
  }
  this._endIfNeedAndPossible();
};

CopyFromStream.prototype.error = function (error) {
  if(this._error || this._closed) {
    return false;
  }
  this._error = true;
  this.emit('error', error);
};

CopyFromStream.prototype.close = function () {
  if(this._error || this._closed) {
    return false;
  }
  if(!this._finishedSent) {
    throw new Error("seems to be error in code that uses CopyFromStream");
  }
  this.emit("close");
};

var CopyToStream = function () {
  Stream.apply(this, arguments);
  this._error = false;
  this._finished = false;
  this._paused = false;
  this.buffer = new Buffer(0);
  this._encoding = undefined;
  this.__defineGetter__('readable', this._readable.bind(this));
};

util.inherits(CopyToStream, Stream);

CopyToStream.prototype._outputDataChunk = function () {
  if(this._paused) {
    return;
  }
  if(this.buffer.length) {
    if(this._encoding) {
      this.emit('data', this.buffer.toString(this._encoding));
    } else {
      this.emit('data', this.buffer);
    }
    this.buffer = new Buffer(0);
  }
};

CopyToStream.prototype._readable = function () {
  return !this._finished && !this._error;
};

CopyToStream.prototype.error = function (error) {
  if(!this.readable) {
    return false;
  }
  this._error = error;
  if(!this._paused) {
    this.emit('error', error);
  }
};

CopyToStream.prototype.close = function () {
  if(!this.readable) {
    return false;
  }
  this._finished = true;
  if(!this._paused) {
    this.emit("end");
  }
};

CopyToStream.prototype.handleChunk = function (chunk) {
  var tmpBuffer;
  if(!this.readable) {
    return;
  }
  if(!this.buffer.length) {
    this.buffer = chunk;
  } else {
    tmpBuffer = new Buffer(this.buffer.length + chunk.length);
    this.buffer.copy(tmpBuffer);
    chunk.copy(tmpBuffer, this.buffer.length);
    this.buffer = tmpBuffer;
  }
  this._outputDataChunk();
};

CopyToStream.prototype.pause = function () {
  if(!this.readable) {
    return false;
  }
  this._paused = true;
};

CopyToStream.prototype.resume = function () {
  if(!this._paused) {
    return false;
  }
  this._paused = false;
  this._outputDataChunk();
  if(this._error) {
    return this.emit('error', this._error);
  }
  if(this._finished) {
    return this.emit('end');
  }
};

CopyToStream.prototype.setEncoding = function (encoding) {
  this._encoding = encoding;
};

module.exports = {
  CopyFromStream: CopyFromStream,
  CopyToStream: CopyToStream
};

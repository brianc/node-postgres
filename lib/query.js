var EventEmitter = require('events').EventEmitter;
var util = require('util');

var Result = require('./result');
var utils = require('./utils');

var Query = function(config, values, callback) {
  // use of "new" optional
  if(!(this instanceof Query)) { return new Query(config, values, callback); }

  config = utils.normalizeQueryConfig(config, values, callback);

  this.text = config.text;
  this.values = config.values;
  this.rows = config.rows;
  this.types = config.types;
  this.name = config.name;
  this.binary = config.binary;
  this.stream = config.stream;
  //use unique portal name each time
  this.portal = config.portal || "";
  this.callback = config.callback;
  if(process.domain && config.callback) {
    this.callback = process.domain.bind(config.callback);
  }
  this._result = new Result(config.rowMode, config.types);
  this.isPreparedStatement = false;
  this._canceledDueToError = false;
  EventEmitter.call(this);
};

util.inherits(Query, EventEmitter);

Query.prototype.requiresPreparation = function() {
  //named queries must always be prepared
  if(this.name) { return true; }
  //always prepare if there are max number of rows expected per
  //portal execution
  if(this.rows) { return true; }
  //don't prepare empty text queries
  if(!this.text) { return false; }
  //binary should be prepared to specify results should be in binary
  //unless there are no parameters
  if(this.binary && !this.values) { return false; }
  //prepare if there are values
  return (this.values || 0).length > 0;
};


//associates row metadata from the supplied
//message with this query object
//metadata used when parsing row results
Query.prototype.handleRowDescription = function(msg) {
  this._result.addFields(msg.fields);
};

Query.prototype.handleDataRow = function(msg) {
  var row = this._result.parseRow(msg.fields);
  this.emit('row', row, this._result);

  //if there is a callback collect rows
  if(this.callback) {
    this._result.addRow(row);
  }
};

Query.prototype.handleCommandComplete = function(msg, con) {
  this._result.addCommandComplete(msg);
  //need to sync after each command complete of a prepared statement
  if(this.isPreparedStatement) {
    con.sync();
  }
};

//if a named prepared statement is created with empty query text
//the backend will send an emptyQuery message but *not* a command complete message
//execution on the connection will hang until the backend receives a sync message
Query.prototype.handleEmptyQuery = function(con) {
  if (this.isPreparedStatement) {
    con.sync();
  }
};

Query.prototype.handleReadyForQuery = function() {
  if(this._canceledDueToError) {
    return this.handleError(this._canceledDueToError);
  }
  if(this.callback) {
    this.callback(null, this._result);
  }
  this.emit('end', this._result);
};

Query.prototype.handleError = function(err, connection) {
  //need to sync after error during a prepared statement
  if(this.isPreparedStatement) {
    connection.sync();
  }
  if(this._canceledDueToError) {
    err = this._canceledDueToError;
    this._canceledDueToError = false;
  }
  //if callback supplied do not emit error event as uncaught error
  //events will bubble up to node process
  if(this.callback) {
    return this.callback(err);
  }
  this.emit('error', err);
};

Query.prototype.submit = function(connection) {
  if(this.requiresPreparation()) {
    this.prepare(connection);
  } else {
    connection.query(this.text);
  }
};

Query.prototype.hasBeenParsed = function(connection) {
  return this.name && connection.parsedStatements[this.name];
};

Query.prototype.handlePortalSuspended = function(connection) {
  this._getRows(connection, this.rows);
};

Query.prototype._getRows = function(connection, rows) {
  connection.execute({
    portal: this.portalName,
    rows: rows
  }, true);
  connection.flush();
};

Query.prototype.prepare = function(connection) {
  var self = this;
  //prepared statements need sync to be called after each command
  //complete or when an error is encountered
  this.isPreparedStatement = true;
  //TODO refactor this poor encapsulation
  if(!this.hasBeenParsed(connection)) {
    connection.parse({
      text: self.text,
      name: self.name,
      types: self.types
    }, true);
  }

  //TODO is there some better way to prepare values for the database?
  if(self.values) {
    for(var i = 0, len = self.values.length; i < len; i++) {
      self.values[i] = utils.prepareValue(self.values[i]);
    }
  }

  //http://developer.postgresql.org/pgdocs/postgres/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY
  connection.bind({
    portal: self.portalName,
    statement: self.name,
    values: self.values,
    binary: self.binary
  }, true);

  connection.describe({
    type: 'P',
    name: self.portalName || ""
  }, true);

  this._getRows(connection, this.rows);
};

Query.prototype.handleCopyInResponse = function (connection) {
  if(this.stream) this.stream.startStreamingToConnection(connection);
  else connection.sendCopyFail('No source stream defined');
};

Query.prototype.handleCopyData = function (msg, connection) {
  var chunk = msg.chunk;
  if(this.stream) {
    this.stream.handleChunk(chunk);
  }
  //if there are no stream (for example when copy to query was sent by
  //query method instead of copyTo) error will be handled
  //on copyOutResponse event, so silently ignore this error here
};
module.exports = Query;

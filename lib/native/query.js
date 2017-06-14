/**
 * Copyright (c) 2010-2017 Brian Carlson (brian.m.carlson@gmail.com)
 * All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * README.md file in the root directory of this source tree.
 */

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var utils = require('../utils');
var NativeResult = require('./result');

var NativeQuery = module.exports = function(config, values, callback) {
  EventEmitter.call(this);
  config = utils.normalizeQueryConfig(config, values, callback);
  this.text = config.text;
  this.values = config.values;
  this.name = config.name;
  this.callback = config.callback;
  this.state = 'new';
  this._arrayMode = config.rowMode == 'array';

  //if the 'row' event is listened for
  //then emit them as they come in
  //without setting singleRowMode to true
  //this has almost no meaning because libpq
  //reads all rows into memory befor returning any
  this._emitRowEvents = false;
  this.on('newListener', function(event) {
    if(event === 'row') this._emitRowEvents = true;
  }.bind(this));
};

util.inherits(NativeQuery, EventEmitter);

NativeQuery.prototype.then = function(onSuccess, onFailure) {
  return this.promise().then(onSuccess, onFailure);
};

NativeQuery.prototype.catch = function(callback) {
  return this.promise().catch(callback);
};

NativeQuery.prototype.promise = function() {
  if (this._promise) return this._promise;
  this._promise = new Promise(function(resolve, reject) {
    this.once('end', resolve);
    this.once('error', reject);
  }.bind(this));
  return this._promise;
};

var errorFieldMap = {
  'sqlState': 'code',
  'statementPosition': 'position',
  'messagePrimary': 'message',
  'context': 'where',
  'schemaName': 'schema',
  'tableName': 'table',
  'columnName': 'column',
  'dataTypeName': 'dataType',
  'constraintName': 'constraint',
  'sourceFile': 'file',
  'sourceLine': 'line',
  'sourceFunction': 'routine',
};

NativeQuery.prototype.handleError = function(err) {
  var self = this;
  //copy pq error fields into the error object
  var fields = self.native.pq.resultErrorFields();
  if(fields) {
    for(var key in fields) {
      var normalizedFieldName = errorFieldMap[key] || key;
      err[normalizedFieldName] = fields[key];
    }
  }
  if(self.callback) {
    self.callback(err);
  } else {
    self.emit('error', err);
  }
  self.state = 'error';
};

NativeQuery.prototype.submit = function(client) {
  this.state = 'running';
  var self = this;
  this.native = client.native;
  client.native.arrayMode = this._arrayMode;

  var after = function(err, rows) {
    client.native.arrayMode = false;
    setImmediate(function() {
      self.emit('_done');
    });

    //handle possible query error
    if(err) {
      return self.handleError(err);
    }

    var result = new NativeResult();
    result.addCommandComplete(self.native.pq);
    result.rows = rows;

    //emit row events for each row in the result
    if(self._emitRowEvents) {
      rows.forEach(function(row) {
        self.emit('row', row, result);
      });
    }


    //handle successful result
    self.state = 'end';
    self.emit('end', result);
    if(self.callback) {
      self.callback(null, result);
    }
  };

  if(process.domain) {
    after = process.domain.bind(after);
  }

  //named query
  if(this.name) {
    if (this.name.length > 63) {
      console.error('Warning! Postgres only supports 63 characters for query names.');
      console.error('You supplied', this.name, '(', this.name.length, ')');
      console.error('This can cause conflicts and silent errors executing queries');
    }
    var values = (this.values||[]).map(utils.prepareValue);

    //check if the client has already executed this named query
    //if so...just execute it again - skip the planning phase
    if(client.namedQueries[this.name]) {
      return client.native.execute(this.name, values, after);
    }
    //plan the named query the first time, then execute it
    return client.native.prepare(this.name, this.text, values.length, function(err) {
      if(err) return after(err);
      client.namedQueries[self.name] = true;
      return self.native.execute(self.name, values, after);
    });
  }
  else if(this.values) {
    var vals = this.values.map(utils.prepareValue);
    client.native.query(this.text, vals, after);
  } else {
    client.native.query(this.text, after);
  }
};

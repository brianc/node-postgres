var EventEmitter = require('events').EventEmitter;
var util = require('util');
var utils = require('../utils');
var NativeResult = require('./result');

var NativeQuery = module.exports = function(native) {
  EventEmitter.call(this);
  this.native = native;
  this.text = null;
  this.values = null;
  this.name = null;
  this.callback = null;
  this.state = 'new';
  this._arrayMode = false;

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

NativeQuery.prototype.handleError = function(err) {
  var self = this;
  //copy pq error fields into the error object
  var fields = self.native.pq.resultErrorFields();
  if(fields) {
    for(var key in fields) {
      err[key] = fields[key];
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
    var values = (this.values||[]).map(utils.prepareValue);
    var this_name = this.name;
    if(this_name.length > 63) {
      this_name = client.getShortName(this_name);
    }

    //check if the client has already executed this named query
    //if so...just execute it again - skip the planning phase
    if(client.namedQueries[this_name]) {
      return this.native.execute(this_name, values, after);
    }
    //plan the named query the first time, then execute it
    return this.native.prepare(this_name, this.text, values.length, function(err) {
      if(err) return after(err);
      client.namedQueries[this_name] = true;
      return self.native.execute(this_name, values, after);
    });
  }
  else if(this.values) {
    var vals = this.values.map(utils.prepareValue);
    this.native.query(this.text, vals, after);
  } else {
    this.native.query(this.text, after);
  }
};

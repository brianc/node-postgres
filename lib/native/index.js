var Native = require('pg-native');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var ConnectionParameters = require(__dirname + '/../connection-parameters');

var NativeQuery = require('./query');

var Client = module.exports = function(config) {
  EventEmitter.call(this);
  if(typeof config === 'string') {
    this.connectionString = config;
  }
  this.native = new Native();
  this._queryQueue = [];
  this._connected = false;

  //keep these on the object for legacy reasons
  //for the time being. TODO: deprecate all this jazz
  var cp = new ConnectionParameters(config);
  this.user = cp.user;
  this.password = cp.password;
  this.database = cp.database;
  this.host = cp.host;
  this.port = cp.port;
};

util.inherits(Client, EventEmitter);

//connect to the backend
//pass an optional callback to be called once connected
//or with an error if there was a connection error
//if no callback is passed and there is a connection error
//the client will emit an error event.
Client.prototype.connect = function(cb) {
  var self = this;
  this.native.connect(this.connectionString, function(err) {
    //error handling
    if(err) {
      if(cb) return cb(err);
      return self.emit('error', err);
    }

    //set internal states to connected
    self._connected = true;
    self.emit('connect');
    self._pulseQueryQueue(true);

    //possibly call the optional callback
    if(cb) cb();
  });
};

Client.prototype.query = function(config, values, callback) {
  var query = new NativeQuery(this.native);

  //support query('text', ...) style calls
  if(typeof config == 'string') {
    query.text = config;
  }

  //support passing everything in via a config object
  if(typeof config == 'object') {
    query.text = config.text;
    query.values = config.values;
    query.name = config.name;
    query.callback = config.callback;
  }

  //support query({...}, function() {}) style calls
  //& support query(..., ['values'], ...) style calls
  if(typeof values == 'function') {
    query.callback = values;
  }
  else if(util.isArray(values)) {
    query.values = values;
  }
  if(typeof callback == 'function') {
    query.callback = callback;
  }

  this._queryQueue.push(query);
  this._pulseQueryQueue();
  return query;
};

Client.prototype.end = function(cb) {
  var self = this;
  this.native.end(function() {
    self.emit('end');
    if(cb) cb();
  });
};

Client.prototype._pulseQueryQueue = function(initialConnection) {
  if(!this._connected) {
    return;
  }
  if(this._activeQuery) {
    if(this._activeQuery.state != 'error' && this._activeQuery.state != 'end') {
      return;
    }
  }
  var query = this._queryQueue.shift();
  if(!query) {
    if(!initialConnection) {
      this.emit('drain');
    }
    return;
  }
  this._activeQuery = query;
  query.submit();
  var self = this;
  query.once('_done', function() {
    self._pulseQueryQueue();
  });
};

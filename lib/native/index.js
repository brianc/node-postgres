//require the c++ bindings & export to javascript
var sys = require('sys');
var EventEmitter = require('events').EventEmitter;
var utils = require(__dirname + "/../utils");

var binding = require(__dirname + '/../../build/default/binding');
var Connection = binding.Connection;
var types = require(__dirname + "/../types");
var NativeQuery = require(__dirname + '/query');

var p = Connection.prototype;

var nativeConnect = p.connect;

p.connect = function() {
  var self = this;
  utils.buildLibpqConnectionString(this._config, function(err, conString) {
    if(err) return self.emit('error', err);
    nativeConnect.call(self, conString);
  })
}

p.query = function(config, values, callback) {
  var q = new NativeQuery(config, values, callback);
  this._queryQueue.push(q);
  this._pulseQueryQueue();
  return q;
}

p._pulseQueryQueue = function(initialConnection) {
  if(!this._connected) {
    return;
  }
  if(this._activeQuery) {
    return;
  }
  var query = this._queryQueue.shift();
  if(!query) {
    if(!initialConnection) {
      this._drainPaused ? this._drainPaused++ : this.emit('drain');
    }
    return;
  }
  this._activeQuery = query;
  if(query.name) {
    if(this._namedQueries[query.name]) {
      this._sendQueryPrepared(query.name, query.values||[]);
    } else {
      this._namedQuery = true;
      this._namedQueries[query.name] = true;
      this._sendPrepare(query.name, query.text, (query.values||[]).length);
    }
  }
  else if(query.values) {
    //call native function
    this._sendQueryWithParams(query.text, query.values)
  } else {
    //call native function
    this._sendQuery(query.text);
  }
}

p.pauseDrain = function() {
  this._drainPaused = 1;
};

p.resumeDrain = function() {
  if(this._drainPaused > 1) { 
    this.emit('drain') 
  };
  this._drainPaused = 0;
};

var clientBuilder = function(config) {
  config = config || {};
  var connection = new Connection();
  connection._queryQueue = [];
  connection._namedQueries = {};
  connection._activeQuery = null;
  connection._config = utils.normalizeConnectionInfo(config);
  //attach properties to normalize interface with pure js client
  connection.user = connection._config.user;
  connection.password = connection._config.password;
  connection.database = connection._config.database;
  connection.host = connection._config.host;
  connection.port = connection._config.port;
  connection.on('connect', function() {
    connection._connected = true;
    connection._pulseQueryQueue(true);
  });

  //proxy some events to active query
  connection.on('_row', function(row) {
    connection._activeQuery.handleRow(row);
  })
  connection.on('_error', function(err) {
    //give up on trying to wait for named query prepare
    this._namedQuery = false;
    if(connection._activeQuery) {
      connection._activeQuery.handleError(err);
    } else {
      connection.emit('error', err);
    }
  })
  connection.on('_readyForQuery', function() {
    var q = this._activeQuery;
    //a named query finished being prepared
    if(this._namedQuery) {
      this._namedQuery = false;
      this._sendQueryPrepared(q.name, q.values||[]);
    } else {
      connection._activeQuery.handleReadyForQuery();
      connection._activeQuery = null;
      connection._pulseQueryQueue();
    }
  });
  return connection;
};

module.exports = clientBuilder;

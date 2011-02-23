//require the c++ bindings & export to javascript
var binding = require(__dirname + '/../build/default/binding');
var Connection = binding.Connection;
var p = Connection.prototype;

var add = function(params, config, paramName) {
  var value = config[paramName];
  if(value) {
    params.push(paramName+"='"+value+"'");
  }
}

var getLibpgConString = function(config, callback) {
  var params = []
  if(typeof config == 'object') {
    add(params, config, 'user');
    add(params, config, 'password');
    add(params, config, 'port');
    if(config.database) {
      params.push("dbname='" + config.database + "'");
    }
    if(config.host) {
      if(config.host != 'localhost') {
        throw new Exception("Need to use node to do async DNS on host");
      }
      params.push("hostaddr=127.0.0.1 ");
    }
  }
  callback(params.join(" "));
}

var nativeConnect = p.connect;

p.connect = function() {
  var self = this;
  getLibpgConString(this._config, function(conString) {
    nativeConnect.call(self, conString);
  })
}

p.query = function(queryString) {
  this._queryQueue.push(queryString);
  this._pulseQueryQueue();
  return this;
}

p._pulseQueryQueue = function() {
  if(!this._connected) {
    return;
  }
  if(this._activeQuery) {
    return;
  }
  var query = this._queryQueue.shift();
  if(!query) {
    this.emit('drain');
    return;
  }
  this._sendQuery(query);
}

var ctor = function(config) {
  var connection = new Connection();
  connection._queryQueue = [];
  connection._activeQuery = null;
  connection._config = config;
  connection.on('connect', function() {
    connection._connected = true;
    connection._pulseQueryQueue();
  });
  connection.on('readyForQuery', function() {
    this.emit('end');
    this._activeQuery = null;
    connection._pulseQueryQueue();
  })
  return connection;
}

module.exports = {
  Client:ctor
};

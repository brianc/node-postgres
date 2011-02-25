//require the c++ bindings & export to javascript
var sys = require('sys');
var EventEmitter = require('events').EventEmitter;

var binding = require(__dirname + '/../build/default/binding');
var utils = require(__dirname + "/utils");
var Connection = binding.Connection;
var p = Connection.prototype;

var add = function(params, config, paramName) {
  var value = config[paramName];
  if(value) {
    params.push(paramName+"='"+value+"'");
  }
}

var getLibpgConString = function(config, callback) {
  if(typeof config == 'object') {
    var params = []
    add(params, config, 'user');
    add(params, config, 'password');
    add(params, config, 'port');
    if(config.database) {
      params.push("dbname='" + config.database + "'");
    }
    if(config.host) {
      if(config.host != 'localhost' && config.host != '127.0.0.1') {
        throw new Error("Need to use node to do async DNS on host");
      }
      params.push("hostaddr=127.0.0.1 ");
    }
    callback(params.join(" "));
  } else if (typeof config == 'string') {
    getLibpgConString(utils.parseConnectionString(config), callback)
  } else {
    throw new Error("Unrecognized config type for connection");
  }
}

var nativeConnect = p.connect;

p.connect = function() {
  var self = this;
  getLibpgConString(this._config, function(conString) {
    nativeConnect.call(self, conString);
  })
}

p.query = function(config) {
  var q = new NativeQuery(config);
  this._queryQueue.push(q);
  this._pulseQueryQueue();
  return q;
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
  this._activeQuery = query;
  if(query.values) {
    //call native function
    this._sendQueryWithParams(query.text, query.values)
  } else {
    //call native function
    this._sendQuery(query.text);
  }
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

  //proxy some events to active query
  connection.on('_row', function(row) {
    connection._activeQuery.emit('row', row);
  })
  connection.on('_error', function(err) {
    if(connection._activeQuery) {
      connection._activeQuery.emit('error', err);
    } else {
      connection.emit('error', err);
    }
  })
  connection.on('_readyForQuery', function() {
    connection._activeQuery.emit('end');
    connection._activeQuery = null;
    connection._pulseQueryQueue();
  });
  return connection;
};

var connect = function(config, callback) {
  var client = new ctor(config);
  client.connect();
  client.on('connect', function() {
    callback(null, client);
  })
};

//event emitter proxy
var NativeQuery = function(text, values) {
  if(typeof text == 'object') {
    this.text = text.text;
    this.values = text.values;
  } else {
    this.text = text;
    this.values = values;
  }
  EventEmitter.call(this);
};

sys.inherits(NativeQuery, EventEmitter);
var p = NativeQuery.prototype;


module.exports = {
  Client: ctor,
  connect: connect
};

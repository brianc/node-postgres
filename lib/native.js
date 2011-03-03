//require the c++ bindings & export to javascript
var sys = require('sys');
var EventEmitter = require('events').EventEmitter;

var binding = require(__dirname + '/../build/default/binding');
var utils = require(__dirname + "/utils");
var types = require(__dirname + "/types");
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

p.query = function(config, values, callback) {
  var q = new NativeQuery(config, values, callback);
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
    connection._activeQuery.handleRow(row);
  })
  connection.on('_error', function(err) {
    if(connection._activeQuery) {
      connection._activeQuery.handleError(err);
    } else {
      connection.emit('error', err);
    }
  })
  connection.on('_readyForQuery', function() {
    connection._activeQuery.handleReadyForQuery();
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
  client.on('error', function(err) {
    callback(err, null);
  })
};

//event emitter proxy
var NativeQuery = function(text, values, callback) {
  if(typeof text == 'object') {
    this.text = text.text;
    this.values = text.values;
  } else {
    this.text = text;
    this.callback = callback;
    this.values = values;
  }
  if(typeof values == 'function') {
    this.values = null;
    this.callback = values;
  }
  if(this.callback) {
    this.rows = [];
  }
  EventEmitter.call(this);
  this._translateValues();
};

sys.inherits(NativeQuery, EventEmitter);
var p = NativeQuery.prototype;

//maps from native rowdata into api compatible row object
var mapRowData = function(row) {
  var result = {};
  for(var i = 0, len = row.length; i < len; i++) {
    var item = row[i];
    var parser = types.getStringTypeParser(item.type);
    result[item.name] = parser(item.value);
  }
  return result;
}

p.handleRow = function(rowData) {
  var row = mapRowData(rowData);
  if(this.callback) {
    this.rows.push(row);
  }
  this.emit('row', row);
};

p.handleError = function(error) {
  if(this.callback) {
    this.callback(error);
    this.callback = null;
  } else {
    this.emit('error', error);
  }
}

p.handleReadyForQuery = function() {
  if(this.callback) {
    this.callback(null, { rows: this.rows });
  }
  this.emit('end');
};

//translates values into strings
p._translateValues = function() {
  if(this.values) {
    this.values = this.values.map(function(val) {
      return val.toString();
    });
  }
}

module.exports = {
  Client: ctor,
  connect: connect,
  end: function() {
    
  }
};

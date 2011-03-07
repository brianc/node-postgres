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

var ctor = function(config) {
  config = config || {};
  var connection = new Connection();
  connection._queryQueue = [];
  connection._namedQueries = {};
  connection._activeQuery = null;
  connection._config = utils.normalizeConnectionInfo(config);
  connection.on('connect', function() {
    connection._connected = true;
    connection._pulseQueryQueue();
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

//event emitter proxy
var NativeQuery = function(text, values, callback) {
  if(typeof text == 'object') {
    this.text = text.text;
    this.values = text.values;
    this.name = text.name;
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
  //normalize values
  if(this.values) {
    for(var i = 0, len = this.values.length; i < len; i++) {
      var item = this.values[i];
      if(item instanceof Date) {
        this.values[i] = JSON.stringify(item);
      }
    }
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

var pool = require(__dirname + '/client-pool').init(ctor);

module.exports = {
  Client: ctor,
  connect: pool.connect,
  end: pool.end
};

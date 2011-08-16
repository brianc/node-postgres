//require the c++ bindings & export to javascript
var sys = require('sys');
var EventEmitter = require('events').EventEmitter;

var binding = require(__dirname + '/../build/default/binding');
var utils = require(__dirname + "/utils");
var types = require(__dirname + "/types");
var Connection = binding.Connection;
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
      this.emit('drain');
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

var ctor = function(config) {
  config = config || {};
  var connection = new Connection();
  connection._queryQueue = [];
  connection._namedQueries = {};
  connection._activeQuery = null;
  connection._config = utils.normalizeConnectionInfo(config);
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

//event emitter proxy
var NativeQuery = function(text, values, callback) {
  //TODO there are better ways to detect overloads
  if(typeof text == 'object') {
    this.text = text.text;
    this.values = text.values;
    this.name = text.name;
    if(typeof values === 'function') {
      this.callback = values;
    } else if(typeof values !== 'undefined') {
      this.values = values;
      this.callback = callback;
    }
  } else {
    this.text = text;
    this.values = values;
    this.callback = callback;
    if(typeof values == 'function') {
      this.values = null;
      this.callback = values;
    }
  }
  if(this.callback) {
    this.rows = [];
  }
  //normalize values
  if(this.values) {
    for(var i = 0, len = this.values.length; i < len; i++) {
      var item = this.values[i];
      switch(typeof item) {
      case 'undefined':
        this.values[i] = null;
        break;
      case 'object':
        this.values[i] = item === null ? null : JSON.stringify(item);
        break;
      case 'string':
        //value already string
        break;
      default:
        //numbers
        this.values[i] = item.toString();
      }
    }
  }

  EventEmitter.call(this);
};

sys.inherits(NativeQuery, EventEmitter);
var p = NativeQuery.prototype;

//maps from native rowdata into api compatible row object
var mapRowData = function(row) {
  var result = {};
  for(var i = 0, len = row.length; i < len; i++) {
    var item = row[i];    
    result[item.name] = item.value == null ? null : types.getStringTypeParser(item.type)(item.value);
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

module.exports = ctor;
